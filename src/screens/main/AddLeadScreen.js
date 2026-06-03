import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { leadsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const SOURCES = ['Direct', 'Referral', 'Website', 'Social Media', 'Cold Call', 'Email', 'Exhibition', 'Other'];


export default function AddLeadScreen({ navigation, route }) {
  const existing = route.params?.lead;
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [company, setCompany] = useState(existing?.company || '');
  const [status, setStatus] = useState(existing?.status || 'new');
  const [source, setSource] = useState(existing?.source || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Lead name is required.'); return; }
    if (!phone.trim()) { Alert.alert('Validation', 'Phone number is required.'); return; }

    setSaving(true);
    try {
      const data = { name: name.trim(), phone: phone.trim(), email: email.trim(), company: company.trim(), status, source, notes };
      if (isEditing) {
        await leadsApi.update(existing._id, data);
        Alert.alert('✅ Updated', 'Lead has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await leadsApi.create(data);
        Alert.alert('✅ Lead Added', `${name} has been added to your leads.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      console.log('Save lead error:', JSON.stringify(e.response?.data));
      const msg = e.response?.data?.message || e.response?.data?.error
        || (e.response?.data?.errors ? Object.values(e.response.data.errors).map(v=>v.message).join(', ') : null)
        || e.message || 'Failed to save lead.';
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
            placeholder="e.g. Raj Kumar"
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
            placeholder="e.g. raj@company.com"
            placeholderTextColor={Theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Company</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ABC Technologies"
            placeholderTextColor={Theme.colors.textSecondary}
            value={company}
            onChangeText={setCompany}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Details</Text>

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

          <Text style={styles.label}>Source</Text>
          <TouchableOpacity style={styles.selector} onPress={() => setShowSourcePicker(!showSourcePicker)}>
            <Text style={[styles.selectorText, !source && styles.placeholder]}>
              {source || 'Select source...'}
            </Text>
            <Ionicons name={showSourcePicker ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
          {showSourcePicker && (
            <View style={styles.dropdown}>
              {SOURCES.map((s) => (
                <TouchableOpacity key={s} style={styles.dropdownItem} onPress={() => { setSource(s); setShowSourcePicker(false); }}>
                  <Text style={styles.dropdownText}>{s}</Text>
                  {source === s && <Ionicons name="checkmark" size={18} color={Theme.colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any relevant notes about this lead..."
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
              <Ionicons name={isEditing ? 'save-outline' : 'add-circle-outline'} size={22} color="#fff" />
              <Text style={styles.saveBtnText}>{isEditing ? 'Update Lead' : 'Add Lead'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStatusColor = (status) => {
  switch (status) {
    case 'new': return '#3B82F6';
    case 'contacted': return '#F59E0B';
    case 'qualified': return '#10B981';
    case 'proposal': return '#8B5CF6';
    case 'negotiation': return '#F97316';
    case 'won': return '#059669';
    case 'lost': return '#EF4444';
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
  placeholder: { color: Theme.colors.textSecondary },
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
