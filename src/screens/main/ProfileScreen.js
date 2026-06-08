import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, Linking, Image,
  ActivityIndicator, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { profileApi } from '../../api';
import { uploadToCloudinary } from '../../services/cloudinary';
import { Theme } from '../../theme/Theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({});

  const avatarUri = user?.avatar && /^(https?:|data:image)/.test(user.avatar) ? user.avatar : null;

  const openEdit = () => {
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      designation: user?.designation || '',
      department: user?.department || user?.team || '',
      employeeId: user?.employeeId || '',
    });
    setEditOpen(true);
  };

  const saveDetails = async () => {
    setSaving(true);
    try {
      await profileApi.update({ user: form });
      await refreshUser();
      setEditOpen(false);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploading(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].base64, CLOUD_NAME, UPLOAD_PRESET);
      await profileApi.uploadPhoto(url);
      await refreshUser();
    } catch (e) {
      Alert.alert('Upload failed', 'Could not update your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Re-fetch fresh user data every time the tab is visited
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  const handleCall = () => user?.phone && Linking.openURL(`tel:${user.phone}`);
  const handleEmail = () => user?.email && Linking.openURL(`mailto:${user.email}`);

  // Try multiple possible field names the backend might use
  const phone = user?.phone || user?.mobile || user?.phoneNumber || user?.contact;
  const department = user?.department || user?.team || user?.branch;
  const employeeId = user?.employeeId || user?.empId || user?.staffId;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Ionicons name="menu-outline" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 160 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />}
    >
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <TouchableOpacity activeOpacity={0.8} onPress={handlePickPhoto} disabled={uploading}>
          <View style={styles.avatar}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {user?.name ? user.name.substring(0, 2).toUpperCase() : 'U'}
              </Text>
            )}
            <View style={styles.cameraBadge}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={16} color="#fff" />}
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user?.name || 'User'}</Text>
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
          </View>
        ) : null}
        {department ? (
          <Text style={styles.department}>{department}</Text>
        ) : null}

        <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
          <Ionicons name="create-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.editBtnText}>Edit Details</Text>
        </TouchableOpacity>
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <InfoRow
          icon="mail-outline"
          label="Email"
          value={user?.email || 'Not provided'}
          onPress={user?.email ? handleEmail : null}
          actionIcon={user?.email ? 'open-outline' : null}
        />

        <InfoRow
          icon="call-outline"
          label="Phone"
          value={phone || 'Not provided'}
          onPress={phone ? handleCall : null}
          actionIcon={phone ? 'call-outline' : null}
        />
      </View>

      {/* Work Information */}
      {(employeeId || department || user?.designation || user?.manager) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Information</Text>
          {user?.designation ? <InfoRow icon="briefcase-outline" label="Designation" value={user.designation} /> : null}
          {department ? <InfoRow icon="business-outline" label="Department" value={department} /> : null}
          {employeeId ? <InfoRow icon="card-outline" label="Employee ID" value={String(employeeId)} /> : null}
          {user?.manager ? <InfoRow icon="person-outline" label="Manager" value={typeof user.manager === 'object' ? user.manager.name : user.manager} /> : null}
        </View>
      ) : null}

      {/* Debug: Show all user fields (remove in production if needed) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <InfoRow icon="shield-checkmark-outline" label="Account Status" value="Active" />
        {user?.createdAt ? (
          <InfoRow
            icon="calendar-outline"
            label="Member Since"
            value={new Date(user.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
          />
        ) : null}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color={Theme.colors.white} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>

    {/* Edit details modal */}
    <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Details</Text>
            <TouchableOpacity onPress={() => setEditOpen(false)}>
              <Ionicons name="close" size={24} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: Theme.spacing.l, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {[
              { key: 'name', label: 'Full Name', kb: 'default' },
              { key: 'phone', label: 'Phone', kb: 'phone-pad' },
              { key: 'designation', label: 'Designation', kb: 'default' },
              { key: 'department', label: 'Department', kb: 'default' },
              { key: 'employeeId', label: 'Employee ID', kb: 'default' },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: 14 }}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={String(form[f.key] ?? '')}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  keyboardType={f.kb}
                  placeholder={f.label}
                  placeholderTextColor={Theme.colors.textSecondary}
                />
              </View>
            ))}
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={saveDetails} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, onPress, actionIcon }) {
  return (
    <TouchableOpacity
      style={styles.infoRow}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={styles.infoIconBox}>
        <Ionicons name={icon} size={18} color={Theme.colors.primary} />
      </View>
      <View style={styles.infoTextContainer}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, onPress && styles.infoValueLink]}>{value}</Text>
      </View>
      {actionIcon && (
        <Ionicons name={actionIcon} size={16} color={Theme.colors.primary} style={{ marginLeft: 'auto' }} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
  },
  header: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Theme.typography.fontFamily,
  },
  menuBtn: {
    width: 40,
    alignItems: 'center',
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    paddingTop: Theme.spacing.l,
    paddingBottom: Theme.spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.m,
    elevation: 3,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.title,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.white,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.white,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Theme.spacing.m,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.round,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  editBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Theme.spacing.l, borderBottomWidth: 1, borderBottomColor: Theme.colors.border,
  },
  modalTitle: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  fieldLabel: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Theme.colors.surface, borderRadius: Theme.borderRadius.m,
    borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary, borderRadius: Theme.borderRadius.m,
    paddingVertical: 15, alignItems: 'center', marginTop: Theme.spacing.m, marginBottom: 30,
  },
  saveBtnText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: '#fff',
  },
  name: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  roleBadge: {
    marginTop: 8,
    backgroundColor: Theme.colors.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.round,
  },
  roleText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
    letterSpacing: 1,
  },
  department: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 6,
  },
  section: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginTop: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    paddingHorizontal: Theme.spacing.l,
    paddingVertical: Theme.spacing.m,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.spacing.m,
    marginTop: Theme.spacing.s,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    gap: 12,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    marginTop: 2,
  },
  infoValueLink: {
    color: Theme.colors.primary,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.error,
    marginHorizontal: Theme.spacing.l,
    marginTop: Theme.spacing.xl,
    marginBottom: 40,
    paddingVertical: Theme.spacing.m,
    borderRadius: Theme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
  },
  logoutText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.white,
  },
});
