import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { newClientsApi } from '../api';
import { Theme } from '../theme/Theme';

const waLink = (p) => `https://wa.me/${String(p || '').replace(/\D/g, '')}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Demo requests captured from the "Book a Free Demo" WhatsApp ice breaker.
 * Dropped into the admin dashboard + HR dashboard. Self-contained: fetches its
 * own data and silently renders nothing to roles the endpoint rejects (403).
 */
export default function DemoRequestsCard() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await newClientsApi.list({ type: 'demo' });
      setItems((res.data || []).filter((x) => x.status !== 'done'));
    } catch (e) {
      setItems([]); // 403 for non-admin/HR, or network — just show nothing
    } finally {
      setLoaded(true);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const markDone = async (item) => {
    setBusyId(item._id);
    try {
      await newClientsApi.update(item._id, { status: 'done' });
      setItems((prev) => prev.filter((x) => x._id !== item._id));
    } catch (e) { /* ignore */ } finally {
      setBusyId(null);
    }
  };

  if (!loaded) return null; // avoid a flash before the first load

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="calendar" size={18} color={Theme.colors.primary} />
        <Text style={styles.title}>Demo Requests</Text>
        {items.length > 0 && (
          <View style={styles.countPill}><Text style={styles.countText}>{items.length}</Text></View>
        )}
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>No pending demo requests.</Text>
      ) : (
        items.map((it, i) => {
          const name = it.contactPerson || it.name || 'New request';
          const phone = it.businessPhone || it.phone;
          return (
            <View key={it._id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(name || 'D').substring(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}{it.businessName ? ` · ${it.businessName}` : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>{phone || '—'} · {fmt(it.createdAt)}</Text>
              </View>
              {phone ? (
                <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(waLink(phone)).catch(() => {})}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.iconBtn} onPress={() => markDone(it)} disabled={busyId === it._id}>
                {busyId === it._id
                  ? <ActivityIndicator size="small" color={Theme.colors.primary} />
                  : <Ionicons name="checkmark-circle-outline" size={22} color={Theme.colors.primary} />}
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  countPill: { backgroundColor: Theme.colors.primary, borderRadius: 999, minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' },
  countText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '800', color: '#fff' },
  empty: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '800', color: Theme.colors.primary },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  meta: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 1 },
  iconBtn: { padding: 6 },
});
