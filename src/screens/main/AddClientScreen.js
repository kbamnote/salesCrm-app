import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUSES = ['prospect', 'active', 'inactive', 'closed'];

export default function AddClientScreen({ navigation, route }) {
  const existing = route.params?.client;
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [company, setCompany] = useState(existing?.company || '');
  const [city, setCity] = useState(existing?.city || '');
  const [area, setArea] = useState(existing?.area || '');
  const [status, setStatus] = useState(existing?.status || 'prospect');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Client name is required.'); return; }
    if (!phone.trim()) { Alert.alert('Validation', 'Phone number is required.'); return; }

    setSaving(true);
    try {
      const data = { name: name.trim(), phone: phone.trim(), email: email.trim(), company: company.trim(), city: city.trim(), area: area.trim(), status, notes };
      if (isEditing) {
        await clientsApi.update(existing._id, data);
        Alert.alert('✅ Updated', 'Client has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await clientsApi.create(data);
        Alert.alert('✅ Client Added', `${name} has been added to your clients.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'Failed to save client.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Priya Sharma"
            placeholderTextColor={Theme.colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. +91 9876543210"
            placeholderTextColor={Theme.colors.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. priya@company.com"
            placeholderTextColor={Theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Company</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. XYZ Enterprises"
            placeholderTextColor={Theme.colors.textSecondary}
            value={company}
            onChangeText={setCompany}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Mumbai"
            placeholderTextColor={Theme.colors.textSecondary}
            value={city}
            onChangeText={setCity}
          />

          <Text style={styles.label}>Area / Locality</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Andheri West"
            placeholderTextColor={Theme.colors.textSecondary}
            value={area}
            onChangeText={setArea}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status & Notes</Text>

          <Text style={styles.label}>Status</Text>
          <TouchableOpacity style={styles.selector} onPress={() => setShowStatusPicker(!showStatusPicker)}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
            <Text style={styles.selectorText}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
            <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
          {showStatusPicker && (
            <View style={styles.dropdown}>
              {STATUSES.map((s) => (
                <TouchableOpacity key={s} style={styles.dropdownItem} onPress={() => { setStatus(s); setShowStatusPicker(false); }}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(s) }]} />
                  <Text style={styles.dropdownText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                  {status === s && <Ionicons name="checkmark" size={18} color={Theme.colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any relevant notes about this client..."
            placeholderTextColor={Theme.colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name={isEditing ? 'save-outline' : 'person-add-outline'} size={22} color="#fff" />
              <Text style={styles.saveBtnText}>{isEditing ? 'Update Client' : 'Add Client'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return '#10B981';
    case 'prospect': return '#3B82F6';
    case 'inactive': return '#9CA3AF';
    case 'closed': return '#EF4444';
    default: return '#9CA3AF';
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  scrollContent: { paddingBottom: 40 },
  section: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginTop: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
    marginBottom: Theme.spacing.m,
  },
  label: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginBottom: 6,
    marginTop: Theme.spacing.m,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  textArea: { height: 100, paddingTop: Theme.spacing.m },
  selector: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  selectorText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    flex: 1,
  },
  dropdown: {
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    marginTop: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  dropdownText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    flex: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.primary,
    marginHorizontal: Theme.spacing.m,
    marginTop: Theme.spacing.xl,
    paddingVertical: 15,
    borderRadius: Theme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 2,
  },
  saveBtnDisabled: { backgroundColor: Theme.colors.textSecondary },
  saveBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
});
