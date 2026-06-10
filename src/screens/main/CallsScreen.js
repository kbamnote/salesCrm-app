import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { callsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const OUTCOME_META = {
  interested:      { label: 'Interested',      icon: 'thumbs-up',   color: '#10B981', bg: '#D1FAE5' },
  not_interested:  { label: 'Not Interested',  icon: 'thumbs-down', color: '#EF4444', bg: '#FEE2E2' },
  meeting_fixed:   { label: 'Meeting Fixed',   icon: 'calendar',    color: '#6366F1', bg: '#EEF2FF' },
  callback:        { label: 'Callback',        icon: 'call',        color: '#F59E0B', bg: '#FEF3C7' },
  no_answer:       { label: 'No Answer',       icon: 'call-outline',color: '#6B7280', bg: '#F3F4F6' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'interested', label: 'Interested' },
  { key: 'callback', label: 'Callback' },
  { key: 'meeting_fixed', label: 'Meeting' },
];

export default function CallsScreen() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const res = await callsApi.list();
      setCalls(res.data || []);
    } catch (e) {
      console.log('Error loading calls', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = calls.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'today') {
      const cd = c.date ? new Date(c.date).toISOString().split('T')[0]
        : c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '';
      return cd === todayStr;
    }
    return c.outcome === filter;
  });

  const fmtDuration = (sec) => {
    if (!sec) return '-';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const fmtTime = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    const now = new Date();
    const isToday = dt.toDateString() === now.toDateString();
    if (isToday) return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return dt.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' +
      dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderCall = ({ item }) => {
    const meta = OUTCOME_META[item.outcome] || OUTCOME_META.no_answer;
    return (
      <View style={styles.card}>
        <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.clientName || 'Unknown'}</Text>
          <View style={styles.cardRow}>
            <View style={[styles.outcomeChip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.outcomeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {item.duration ? (
              <View style={styles.durChip}>
                <Ionicons name="time-outline" size={11} color={Theme.colors.textSecondary} />
                <Text style={styles.durText}>{fmtDuration(item.duration)}</Text>
              </View>
            ) : null}
          </View>
          {item.notes ? <Text style={styles.notes} numberOfLines={1}>{item.notes}</Text> : null}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.timeText}>{fmtTime(item.date || item.createdAt)}</Text>
          {item.clientName ? (
            <TouchableOpacity
              style={styles.callBackBtn}
              onPress={() => {
                const phone = item.phone || '';
                if (phone) Linking.openURL(`tel:${phone}`);
              }}
            >
              <Ionicons name="call" size={14} color={Theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  // Summary counts
  const todayCalls = calls.filter(c => {
    const cd = c.date ? new Date(c.date).toISOString().split('T')[0]
      : c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '';
    return cd === todayStr;
  }).length;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Summary strip */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{calls.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#6366F1' }]}>{todayCalls}</Text>
          <Text style={styles.summaryLabel}>Today</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>
            {calls.filter(c => c.outcome === 'interested').length}
          </Text>
          <Text style={styles.summaryLabel}>Interested</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
            {calls.filter(c => c.outcome === 'callback').length}
          </Text>
          <Text style={styles.summaryLabel}>Callback</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item._id || String(i)}
        renderItem={renderCall}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No calls recorded yet' : 'No calls match this filter'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  summaryRow: {
    flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12,
    borderRadius: 14, padding: 14, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '800', color: Theme.colors.text },
  summaryLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: Theme.colors.border },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border,
  },
  filterChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary },
  filterTextActive: { color: '#fff' },

  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  cardIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  outcomeChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  outcomeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700' },
  durChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  durText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600' },
  notes: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 4 },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  timeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary },
  callBackBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center',
  },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12 },
});
