import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { leadsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUS = {
  new: { label: 'New', bg: '#DBEAFE', color: '#1E40AF' },
  contacted: { label: 'Contacted', bg: '#FEF3C7', color: '#92400E' },
  qualified: { label: 'Qualified', bg: '#E0E7FF', color: '#3730A3' },
  proposal: { label: 'Proposal', bg: '#FCE7F3', color: '#9D174D' },
  negotiation: { label: 'Negotiation', bg: '#FFE4E6', color: '#9F1239' },
  won: { label: 'Won', bg: '#D1FAE5', color: '#065F46' },
  converted: { label: 'Converted', bg: '#D1FAE5', color: '#065F46' },
  lost: { label: 'Lost', bg: '#F3F4F6', color: '#6B7280' },
  dropped: { label: 'Dropped', bg: '#F3F4F6', color: '#6B7280' },
};
const fmtWhen = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function CampaignLeadsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    try {
      const res = await leadsApi.campaign();
      setItems(res.data || []);
    } catch (e) {
      console.log('Error loading campaign leads', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openWhatsApp = (phone) => { if (phone) Linking.openURL(`https://wa.me/${String(phone).replace(/\D/g, '')}`).catch(() => {}); };

  // Import a Facebook Lead Ads CSV export (downloaded from Meta's Instant Forms).
  const importCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      setImporting(true);
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const r = await leadsApi.importFbCsv(text);
      const { inserted = 0, skipped = 0 } = r.data || {};
      Alert.alert(
        'Import complete',
        `${inserted} lead${inserted === 1 ? '' : 's'} added${skipped ? `, ${skipped} skipped (duplicates or invalid rows)` : ''}.`
      );
      load();
    } catch (e) {
      Alert.alert('Import failed', e?.response?.data?.error || e.message || 'Could not import the CSV.');
    } finally {
      setImporting(false);
    }
  };

  const renderItem = ({ item }) => {
    const s = STATUS[item.status] || STATUS.new;
    const isOpen = expanded === item._id;
    const assignee = item.assignedTMS?.name || item.assignedSales?.name;
    return (
      <TouchableOpacity activeOpacity={0.8} style={styles.card} onPress={() => setExpanded(isOpen ? null : item._id)}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: Theme.colors.primary + '15' }]}>
            <Ionicons name="megaphone-outline" size={20} color={Theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.sub} numberOfLines={1}>{item.phone}</Text>
            <Text style={styles.time}>{fmtWhen(item.createdAt)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: s.bg }]}>
            <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
          </View>
        </View>

        {isOpen && (
          <View style={styles.details}>
            <Row icon="call-outline" label="Phone" value={item.phone} onPress={() => openWhatsApp(item.phone)} link />
            {item.email ? <Row icon="mail-outline" label="Email" value={item.email} /> : null}
            {item.city ? <Row icon="location-outline" label="City" value={item.city} /> : null}
            {item.fbAdName ? <Row icon="pricetag-outline" label="Ad" value={item.fbAdName} /> : null}
            {item.fbFormId ? <Row icon="document-text-outline" label="Form ID" value={item.fbFormId} /> : null}
            <Row icon="key-outline" label="Meta Lead ID" value={item.fbLeadId} />
            <Row icon="person-outline" label="Assigned to" value={assignee || 'Unassigned'} />

            {item.fbEventsSent?.length ? (
              <View style={styles.chips}>
                {item.fbEventsSent.map((ev, i) => (
                  <View key={i} style={styles.chip}>
                    <Ionicons name="checkmark-circle" size={12} color={Theme.colors.primary} />
                    <Text style={styles.chipText}>{ev} reported to Meta</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.note}>No stage updates reported to Meta yet.</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
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
      ListHeaderComponent={
        <TouchableOpacity style={styles.importBtn} onPress={importCsv} disabled={importing} activeOpacity={0.85}>
          {importing
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.importText}>Import Facebook Leads (CSV)</Text></>}
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="megaphone-outline" size={52} color={Theme.colors.border} />
          <Text style={styles.emptyTitle}>No campaign leads yet</Text>
          <Text style={styles.emptyText}>Leads submitted through your Facebook/Instagram Lead Ads will appear here.</Text>
        </View>
      }
    />
  );
}

function Row({ icon, label, value, onPress, link }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
      <Ionicons name={icon} size={16} color={Theme.colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, link && { color: Theme.colors.primary }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginBottom: 12,
  },
  importText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '800', color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  sub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },
  time: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800' },
  details: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  rowLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, width: 100 },
  rowValue: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Theme.colors.primary + '10', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '600', color: Theme.colors.primary },
  note: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.textSecondary, marginTop: 12 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
