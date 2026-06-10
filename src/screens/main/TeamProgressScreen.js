import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { targetsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const curMonth = () => new Date().toISOString().slice(0, 7);

const targetMeta = (role) => {
  if (role === 'tme') return { unit: 'appointments', label: 'Appointment Target' };
  if (role === 'telecaller') return { unit: 'appointments', label: 'Appointments / month' };
  if (role === 'tms') return { unit: 'calls', label: 'Call Target' };
  if (role === 'hr') return { unit: 'hirings', label: 'Hiring Target' };
  return { unit: 'revenue', label: 'Revenue Target' };
};

const statusColor = (pct) => {
  if (pct >= 100) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
};

const getStatus = (pct) => {
  if (pct >= 100) return 'exceeded';
  if (pct >= 50) return 'on_track';
  return 'behind';
};

export default function TeamProgressScreen() {
  const [data, setData] = useState([]);
  const [month, setMonth] = useState(curMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const res = await targetsApi.team(month);
      setData(res.data || []);
    } catch (e) {
      console.log('Error loading team targets', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [month]));

  const shiftMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = () => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  };

  const filtered = filter === 'all' ? data : data.filter(t => getStatus(t.percentage) === filter);

  const summary = {
    total: data.length,
    exceeded: data.filter(t => t.percentage >= 100).length,
    onTrack: data.filter(t => t.percentage >= 50 && t.percentage < 100).length,
    behind: data.filter(t => t.percentage < 50).length,
  };

  const totalTarget = data.reduce((s, t) => s + (t.target || 0), 0);
  const totalAchieved = data.reduce((s, t) => s + (t.achieved || 0), 0);
  const overallPct = totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0;

  const FILTERS = [
    { key: 'all', label: 'All', count: summary.total },
    { key: 'exceeded', label: 'Achieved', count: summary.exceeded, color: '#10B981' },
    { key: 'on_track', label: 'On Track', count: summary.onTrack, color: '#F59E0B' },
    { key: 'behind', label: 'Behind', count: summary.behind, color: '#EF4444' },
  ];

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      >
        {/* Month picker */}
        <View style={s.monthRow}>
          <TouchableOpacity style={s.monthArrow} onPress={() => shiftMonth(-1)}>
            <Ionicons name="chevron-back" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{monthLabel()}</Text>
          <TouchableOpacity style={s.monthArrow} onPress={() => shiftMonth(1)}>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Overall progress card */}
        <View style={s.overallCard}>
          <View style={s.overallLeft}>
            <Text style={s.overallTitle}>Overall Team</Text>
            <Text style={s.overallSub}>{data.length} members with targets</Text>
          </View>
          <View style={s.overallRight}>
            <Text style={[s.overallPct, { color: statusColor(overallPct) }]}>{overallPct}%</Text>
            <Text style={s.overallAmt}>₹{totalAchieved.toLocaleString()} / ₹{totalTarget.toLocaleString()}</Text>
          </View>
        </View>
        <View style={s.overallBarBg}>
          <View style={[s.overallBarFill, { width: `${Math.min(overallPct, 100)}%`, backgroundColor: statusColor(overallPct) }]} />
        </View>

        {/* Summary cards */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { borderLeftColor: Theme.colors.primary }]}>
            <Text style={s.summaryNum}>{summary.total}</Text>
            <Text style={s.summaryLabel}>Total</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: '#10B981' }]}>
            <Text style={[s.summaryNum, { color: '#10B981' }]}>{summary.exceeded}</Text>
            <Text style={s.summaryLabel}>Achieved</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: '#F59E0B' }]}>
            <Text style={[s.summaryNum, { color: '#F59E0B' }]}>{summary.onTrack}</Text>
            <Text style={s.summaryLabel}>On Track</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: '#EF4444' }]}>
            <Text style={[s.summaryNum, { color: '#EF4444' }]}>{summary.behind}</Text>
            <Text style={s.summaryLabel}>Behind</Text>
          </View>
        </View>

        {/* Filter chips */}
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterChip, filter === f.key && { backgroundColor: f.color || Theme.colors.primary, borderColor: f.color || Theme.colors.primary }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterText, filter === f.key && { color: '#fff' }]}>
                {f.label} ({f.count})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Employee cards */}
        {filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="flag-outline" size={48} color={Theme.colors.border} />
            <Text style={s.emptyText}>
              {data.length === 0 ? 'No targets set for this month.' : 'No members match this filter.'}
            </Text>
          </View>
        ) : (
          filtered.map((t) => {
            const meta = targetMeta(t.userId?.role);
            const pct = Math.min(t.percentage, 100);
            const color = statusColor(t.percentage);
            const isRevenue = meta.unit === 'revenue';
            return (
              <View key={t._id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>
                      {(t.userId?.name || 'U').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{t.userId?.name || 'Unknown'}</Text>
                    <Text style={s.role}>{t.userId?.role || ''}</Text>
                  </View>
                  <View style={[s.pctBadge, { backgroundColor: color + '18' }]}>
                    <Text style={[s.pctText, { color }]}>{t.percentage}%</Text>
                  </View>
                </View>

                <View style={s.barBg}>
                  <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                </View>

                <View style={s.statsRow}>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Target</Text>
                    <Text style={s.statValue}>
                      {isRevenue ? '₹' : ''}{t.target?.toLocaleString()}
                    </Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Achieved</Text>
                    <Text style={[s.statValue, { color: '#10B981' }]}>
                      {isRevenue ? '₹' : ''}{t.achieved?.toLocaleString()}
                    </Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Pending</Text>
                    <Text style={[s.statValue, { color: t.pending > 0 ? '#EF4444' : '#10B981' }]}>
                      {t.pending > 0
                        ? `${isRevenue ? '₹' : ''}${t.pending?.toLocaleString()}`
                        : 'Done'}
                    </Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Deals</Text>
                    <Text style={s.statValue}>{t.dealsCount}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1,
    borderColor: Theme.colors.border, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 14,
  },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabel: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  overallCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  overallLeft: { flex: 1 },
  overallTitle: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  overallSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2 },
  overallRight: { alignItems: 'flex-end' },
  overallPct: { fontFamily: Theme.typography.fontFamily, fontSize: 28, fontWeight: Theme.typography.weights.bold },
  overallAmt: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2 },
  overallBarBg: {
    height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden',
    marginTop: 8, marginBottom: 16,
  },
  overallBarFill: { height: '100%', borderRadius: 3 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10,
    borderLeftWidth: 3, alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  summaryNum: {
    fontFamily: Theme.typography.fontFamily, fontSize: 20,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  summaryLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border,
  },
  filterText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 12,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary,
  },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary, marginTop: Theme.spacing.m,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: {
    color: '#fff', fontWeight: Theme.typography.weights.bold,
    fontFamily: Theme.typography.fontFamily, fontSize: 13,
  },
  name: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  role: {
    fontFamily: Theme.typography.fontFamily, fontSize: 11,
    color: Theme.colors.textSecondary, textTransform: 'capitalize',
  },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pctText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: Theme.typography.weights.bold },
  barBg: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  barFill: { height: '100%', borderRadius: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontFamily: Theme.typography.fontFamily, fontSize: 10,
    color: Theme.colors.textSecondary, marginBottom: 2,
  },
  statValue: {
    fontFamily: Theme.typography.fontFamily, fontSize: 13,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
});
