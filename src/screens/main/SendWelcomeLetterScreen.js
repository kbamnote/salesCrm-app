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

const FIELDS = [
  { key: 'customerName', label: 'Customer Name', kb: 'default' },
  { key: 'customerEmail', label: 'Customer Email *', kb: 'email-address' },
  { key: 'businessName', label: 'Business Name', kb: 'default' },
  { key: 'url', label: 'URL', kb: 'default' },
  { key: 'userId', label: 'User ID', kb: 'default' },
  { key: 'password', label: 'Password', kb: 'default' },
  { key: 'website', label: 'Website', kb: 'default' },
];

export default function SendWelcomeLetterScreen({ route }) {
  const p = route?.params || {};
  const [form, setForm] = useState({
    date: todayStr(),
    customerName: p.customerName || '',
    customerEmail: p.customerEmail || '',
    businessName: p.businessName || '',
    url: p.url || '',
    userId: p.userId || '',
    password: p.password || '',
    website: p.website || '',
  });
  const [sending, setSending] = useState(false);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.customerEmail.trim()) return Alert.alert('Email required', "Enter the client's email address.");
    if (!form.date.trim()) return Alert.alert('Date required', 'Please enter a date.');
    setSending(true);
    try {
      const res = await clientDocsApi.sendWelcome({
        date: form.date.trim(),
        customerEmail: form.customerEmail.trim(),
        customerName: form.customerName.trim(),
        businessName: form.businessName.trim(),
        url: form.url.trim(),
        userId: form.userId.trim(),
        password: form.password.trim(),
        website: form.website.trim(),
      });
      const msg = res.data?.message || 'Welcome letter sent.';
      Alert.alert('Sent ✅', `${msg}\n\nThe PDF was emailed to ${form.customerEmail.trim()}.`);
      setForm((p) => ({ ...p, customerName: '', customerEmail: '', businessName: '', url: '', userId: '', password: '', website: '' }));
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send the welcome letter.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <Ionicons name="mail" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Send Welcome Letter</Text>
            <Text style={styles.bannerSub}>Emails a Tapify welcome PDF to the client</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput style={styles.input} value={form.date} onChangeText={(v) => setF('date', v)} placeholder="e.g. 14-Jun-2026" placeholderTextColor={Theme.colors.textSecondary} />

        {FIELDS.map((f) => (
          <View key={f.key}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <TextInput
              style={styles.input}
              value={form[f.key]}
              onChangeText={(v) => setF(f.key, v)}
              keyboardType={f.kb}
              autoCapitalize={f.key === 'customerEmail' || f.key === 'url' || f.key === 'website' || f.key === 'userId' || f.key === 'password' ? 'none' : 'sentences'}
              placeholder={f.label.replace(' *', '')}
              placeholderTextColor={Theme.colors.textSecondary}
            />
          </View>
        ))}

        <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.7 }]} onPress={submit} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.sendBtnText}>Send PDF to Client</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#004f5e', borderRadius: 14, padding: 16, marginBottom: 12 },
  bannerTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: '#fff' },
  bannerSub: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 22 },
  sendBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
});
