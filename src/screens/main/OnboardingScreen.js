import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions } from '@react-navigation/native';
import { usersApi } from '../../api';
import { Theme } from '../../theme/Theme';

const ROLES = [
  ['sales', 'Sales'],
  ['tms', 'TMS'],
  ['tme', 'TME'],
  ['telecaller', 'Telecaller'],
  ['designer', 'Designer'],
  ['team_leader', 'Team Leader'],
  ['bdo', 'BDO'],
  ['manager', 'Manager'],
  ['hr', 'HR'],
];

const emptyForm = {
  name: '', email: '', phone: '', role: 'sales', password: '',
  employeeId: '', designation: '', department: '',
};

export default function OnboardingScreen({ navigation }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      return Alert.alert('Missing info', 'Name, email and phone are required.');
    }
    if (!form.password || form.password.length < 4) {
      return Alert.alert('Password', 'Please set a password (at least 4 characters).');
    }
    setSaving(true);
    try {
      await usersApi.create({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        password: form.password,
        employeeId: form.employeeId.trim(),
        designation: form.designation.trim(),
        department: form.department.trim(),
      });
      Alert.alert('✅ Employee onboarded', `${form.name.trim()} has been added. They can now log in with their email and password.`);
      setForm(emptyForm);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create the employee. The email may already be in use.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Ionicons name="menu" size={26} color={Theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Onboard Employee</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Theme.spacing.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Field label="Full Name *" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Ramesh Kumar" />
          <Field label="Email *" value={form.email} onChange={(v) => set('email', v)} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone *" value={form.phone} onChange={(v) => set('phone', v)} placeholder="10-digit mobile" keyboardType="phone-pad" />

          <Text style={styles.label}>Role *</Text>
          <View style={styles.roleWrap}>
            {ROLES.map(([val, lbl]) => {
              const active = form.role === val;
              return (
                <TouchableOpacity key={val} style={[styles.roleChip, active && styles.roleChipActive]} onPress={() => set('role', val)}>
                  <Text style={[styles.roleText, active && styles.roleTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Field label="Password *" value={form.password} onChange={(v) => set('password', v)} placeholder="Set a login password" secureTextEntry />
          <Field label="Employee ID" value={form.employeeId} onChange={(v) => set('employeeId', v)} placeholder="e.g. EMP-102" />
          <Field label="Designation" value={form.designation} onChange={(v) => set('designation', v)} placeholder="e.g. Sales Executive" />
          <Field label="Department" value={form.department} onChange={(v) => set('department', v)} placeholder="e.g. Field Sales" />

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="person-add" size={18} color="#fff" />
                <Text style={styles.saveText}>Onboard Employee</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={Theme.colors.textSecondary}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuBtn: { padding: 4 },
  screenTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xl, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  roleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border },
  roleChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  roleText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, color: Theme.colors.textSecondary, fontWeight: Theme.typography.weights.bold },
  roleTextActive: { color: '#fff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.success, borderRadius: Theme.borderRadius.m, paddingVertical: 15, marginTop: Theme.spacing.m },
  saveText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: '#fff' },
});
