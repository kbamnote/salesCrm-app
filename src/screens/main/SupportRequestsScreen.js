import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { newClientsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUS = {
  new: { label: 'New', bg: '#DBEAFE', color: '#1E40AF' },
  in_progress: { label: 'In progress', bg: '#FEF3C7', color: '#92400E' },
  done: { label: 'Resolved', bg: '#D1FAE5', color: '#065F46' },
};
const NEXT = { new: 'in_progress', in_progress: 'done', done: 'new' };
const NEXT_LABEL = { new: 'In progress', in_progress: 'Resolved', done: 'New' };
const fmtWhen = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const waLink = (p) => `https://wa.me/${String(p || '').replace(/\D/g, '')}`;

export default function SupportRequestsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await newClientsApi.list({ type: 'support' });
      setItems(res.data || []);
    } catch (e) {
      console.log('Error loading support requests', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const cycleStatus = async (item) => {
    const next = NEXT[item.status] || 'in_progress';
    setBusyId(item._id);
    try {
      const res = await newClientsApi.update(item._id, { status: next });
      setItems((prev) => prev.map((x) => (x._id === item._id ? res.data : x)));
    } catch (e) {
      Alert.alert('Error', 'Could not update status.');
    } finally {
      setBusyId(null);
    }
  };

  const openWhatsApp = (phone) => { if (phone) Linking.openURL(waLink(phone)).catch(() => {}); };

  const renderItem = ({ item }) => {
    const s = STATUS[item.status] || STATUS.new;
    const isOpen = expanded === item._id;
    const name = item.contactPerson || item.name || item.phone;
    const phone = item.businessPhone || item.phone;
    const queryText = item.query || item.submissionText;
    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded(isOpen ? null : item._id)}>
          <View style={styles.top}>
            <View style={styles.avatar}><Ionicons name="help-buoy" size={20} color={Theme.colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.time}>{phone || '—'} · {fmtWhen(item.createdAt)}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: s.bg }]}>
              <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
            </View>
          </View>
          {queryText ? (
            <Text style={styles.query} numberOfLines={isOpen ? 20 : 2}>{queryText}</Text>
          ) : null}
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.details}>
            {item.screenshotUrl ? (
              <TouchableOpacity onPress={() => Linking.openURL(item.screenshotUrl).catch(() => {})} activeOpacity={0.9}>
                <Image source={{ uri: item.screenshotUrl }} style={styles.screenshot} resizeMode="cover" />
                <Text style={styles.screenshotHint}>Tap to view screenshot</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.actions}>
              {phone ? (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#25D366' }]} onPress={() => openWhatsApp(phone)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                  <Text style={styles.actionText}>Reply</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: (STATUS[NEXT[item.status]] || STATUS.in_progress).color }]}
                onPress={() => cycleStatus(item)}
                disabled={busyId === item._id}
              >
                {busyId === item._id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.actionText}>Mark {NEXT_LABEL[item.status] || 'In progress'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item, i) => item._id || String(i)}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="help-buoy-outline" size={52} color={Theme.colors.border} />
          <Text style={styles.emptyTitle}>No support requests</Text>
          <Text style={styles.emptyText}>Help & Support messages from WhatsApp will appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  time: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800' },
  query: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, lineHeight: 19, marginTop: 10 },
  details: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  screenshot: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#eee' },
  screenshotHint: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11 },
  actionText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.textSecondary, marginTop: 12 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
