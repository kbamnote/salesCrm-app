import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tapifyCardApi } from '../../api';
import { Theme } from '../../theme/Theme';

const INR = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

export default function DealCompletedScreen({ route, navigation }) {
  // Payment is collected on the wizard's payment step; this screen only handles
  // the post-deal actions (Tapify card + documents).
  const { client, amount, meetingId } = route.params || {};

  // ── Tapify card ──
  const [card, setCard] = useState({
    name: client?.name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    company: client?.company || '',
    password: '',
    occupation: '',
  });
  const [creating, setCreating] = useState(false);
  const [cardResult, setCardResult] = useState(null); // { preview_url, email }

  const setC = (k, v) => setCard((p) => ({ ...p, [k]: v }));

  const createCard = async () => {
    if (!card.name.trim() || !card.email.trim()) return Alert.alert('Missing info', 'Customer name and email are required.');
    if (card.password.trim().length < 6) return Alert.alert('Password', 'Set a login password of at least 6 characters.');
    setCreating(true);
    try {
      const res = await tapifyCardApi.create({
        clientId: client?._id,
        meetingId,
        name: card.name.trim(),
        email: card.email.trim(),
        password: card.password.trim(),
        phone: card.phone.trim(),
        company: card.company.trim(),
        occupation: card.occupation.trim(),
      });
      const previewUrl = res.data?.vcard?.preview_url || '';
      setCardResult({ preview_url: previewUrl, email: card.email.trim() });
      Alert.alert('Card created ✅', previewUrl ? `Tapify card is live:\n${previewUrl}` : 'Tapify card created.');
    } catch (e) {
      const detail = e.response?.data?.error || e.message || 'Could not create the Tapify card.';
      console.error('Create Tapify card failed:', e.response?.status, e.response?.data || e.message);
      Alert.alert('Error', detail);
    } finally {
      setCreating(false);
    }
  };

  const goWelcome = () => {
    navigation.navigate('SendWelcome', {
      customerName: card.name,
      customerEmail: card.email,
      businessName: card.company || card.name,
      url: cardResult?.preview_url || '',
      userId: card.email,
      password: card.password,
      website: '',
    });
  };

  const goTitanium = () => {
    navigation.navigate('SendMembership', { customerName: card.name, customerEmail: card.email });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {/* Banner */}
        <View style={styles.banner}>
          <Ionicons name="checkmark-circle" size={30} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Deal Closed 🎉</Text>
            <Text style={styles.bannerSub}>{client?.name}{amount ? ` · ${INR(amount)}` : ''}</Text>
          </View>
        </View>

        {/* 1. Create Tapify Card */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.stepBadge, cardResult && styles.stepDone]}>
              {cardResult ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={styles.stepNum}>1</Text>}
            </View>
            <Text style={styles.cardTitle}>Create Tapify Card</Text>
          </View>

          {cardResult ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Card live{cardResult.preview_url ? `: ${cardResult.preview_url}` : ''}</Text>
            </View>
          ) : (
            <>
              <Field label="Customer Name *" value={card.name} onChange={(v) => setC('name', v)} />
              <Field label="Email *" value={card.email} onChange={(v) => setC('email', v)} keyboardType="email-address" autoCap="none" />
              <Field label="Phone" value={card.phone} onChange={(v) => setC('phone', v)} keyboardType="phone-pad" />
              <Field label="Company" value={card.company} onChange={(v) => setC('company', v)} />
              <Field label="Occupation" value={card.occupation} onChange={(v) => setC('occupation', v)} />
              <Field label="Login Password * (min 6)" value={card.password} onChange={(v) => setC('password', v)} autoCap="none" />
              <TouchableOpacity style={[styles.primaryBtn, creating && { opacity: 0.7 }]} onPress={createCard} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <><Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Create Card</Text></>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 2. Send documents */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
            <Text style={styles.cardTitle}>Email Documents to Customer</Text>
          </View>
          <TouchableOpacity style={styles.docBtn} onPress={goWelcome}>
            <Ionicons name="mail-outline" size={20} color="#004f5e" />
            <Text style={styles.docBtnText}>Send Welcome Letter</Text>
            <Ionicons name="chevron-forward" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.docBtn} onPress={goTitanium}>
            <Ionicons name="card-outline" size={20} color="#0b3d6b" />
            <Text style={styles.docBtnText}>Send Titanium Card</Text>
            <Ionicons name="chevron-forward" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
          {!cardResult ? <Text style={styles.hint}>Tip: create the card first so the welcome letter is pre-filled with the login details.</Text> : null}
        </View>

        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.navigate('Root')}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, keyboardType, autoCap }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCap || 'sentences'}
        placeholder={label.replace(' *', '')}
        placeholderTextColor={Theme.colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.colors.success, borderRadius: 14, padding: 16, marginBottom: 14 },
  bannerTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: '#fff' },
  bannerSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: Theme.colors.success },
  stepNum: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', color: '#fff' },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },

  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 11, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  primaryBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: '#fff' },

  successBox: { backgroundColor: '#DCFCE7', borderRadius: 10, padding: 12 },
  successText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: '#15803D', fontWeight: '600' },

  docBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10 },
  docBtnText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  hint: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2, lineHeight: 16 },

  doneBtn: { alignItems: 'center', paddingVertical: 14 },
  doneText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.primary },
});
