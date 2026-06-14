import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clientDocsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const todayStr = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');

export default function SendTitaniumCardScreen() {
  const [form, setForm] = useState({ date: todayStr(), customerName: '', customerEmail: '' });
  const [sending, setSending] = useState(false);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.customerEmail.trim()) return Alert.alert('Email required', "Enter the client's email address.");
    if (!form.date.trim()) return Alert.alert('Date required', 'Please enter a date.');
    setSending(true);
    try {
      const res = await clientDocsApi.sendMembership({
        date: form.date.trim(),
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
      });
      const msg = res.data?.message || 'Titanium card sent.';
      Alert.alert('Sent ✅', `${msg}\n\nThe PDF was emailed to ${form.customerEmail.trim()}.`);
      setForm((p) => ({ ...p, customerName: '', customerEmail: '' }));
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send the titanium card.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <Ionicons name="card" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Send Titanium Card</Text>
            <Text style={styles.bannerSub}>Emails the Titanium Club Membership PDF</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput style={styles.input} value={form.date} onChangeText={(v) => setF('date', v)} placeholder="e.g. 14-Jun-2026" placeholderTextColor={Theme.colors.textSecondary} />

        <Text style={styles.fieldLabel}>Customer Name</Text>
        <TextInput style={styles.input} value={form.customerName} onChangeText={(v) => setF('customerName', v)} placeholder="Customer name" placeholderTextColor={Theme.colors.textSecondary} />

        <Text style={styles.fieldLabel}>Customer Email *</Text>
        <TextInput style={styles.input} value={form.customerEmail} onChangeText={(v) => setF('customerEmail', v)} keyboardType="email-address" autoCapitalize="none" placeholder="client@example.com" placeholderTextColor={Theme.colors.textSecondary} />

        <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.7 }]} onPress={submit} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.sendBtnText}>Send PDF to Client</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0b3d6b', borderRadius: 14, padding: 16, marginBottom: 12 },
  bannerTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: '#fff' },
  bannerSub: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 22 },
  sendBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
});
