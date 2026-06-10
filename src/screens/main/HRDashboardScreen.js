import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Dimensions, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { hrDashboardApi } from '../../api';
import { Theme } from '../../theme/Theme';

const { width: SW } = Dimensions.get('window');
const CARD_PAD = 16;

const ROLE_COLORS = {
  admin: '#4a90e2', manager: '#8B5CF6', bdo: '#EC4899', team_leader: '#F59E0B',
  sales: '#10B981', tms: '#06B6D4', tme: '#3B82F6', hr: '#EF4444',
  telecaller: '#F97316', designer: '#A855F7',
};

const STATUS_COLORS = {
  active: '#10B981', on_leave: '#F59E0B', resigned: '#EF4444', terminated: '#6B7280',
};

export default function HRDashboardScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = new Date().toISOString().substring(0, 7);

  const load = async () => {
    try {
      const res = await hrDashboardApi.stats(currentMonth);
      setData(res.data);
    } catch (e) {
      console.log('HR dashboard error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Theme.colors.textSecondary} />
        <Text style={styles.errorText}>Could not load dashboard</Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { totalEmployees, roleCounts, statusCounts, recentJoinings, mostPresent, mostAbsent, workingDays, todaySummary, trend } = data;
  const maxTrend = Math.max(...trend.map(t => t.total), 1);

  const formatJoinDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    const now = new Date();
    const diffDays = Math.floor((now - dt) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return dt.toLocaleDateString('en', { day: 'numeric', month: 'short' });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting banner */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="people" size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>HR Overview</Text>
          <Text style={styles.bannerSub}>{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>

      {/* Quick stat cards */}
      <View style={styles.statsRow}>
        <StatCard icon="people" color={Theme.colors.primary} label="Total Staff" value={totalEmployees} />
        <StatCard icon="checkmark-circle" color="#10B981" label="Present Today" value={todaySummary.present} />
      </View>
      <View style={styles.statsRow}>
        <StatCard icon="pulse" color="#3B82F6" label="Working Now" value={todaySummary.working} />
        <StatCard icon="close-circle" color="#EF4444" label="Absent Today" value={todaySummary.absent} />
      </View>

      {/* 7-day attendance trend chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance Trend (7 Days)</Text>
        <View style={styles.chartContainer}>
          {trend.map((t, i) => {
            const barH = maxTrend > 0 ? (t.present / maxTrend) * 100 : 0;
            const pct = t.total > 0 ? Math.round((t.present / t.total) * 100) : 0;
            return (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barValue}>{t.present}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${Math.max(barH, 4)}%`, backgroundColor: pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }]} />
                </View>
                <Text style={styles.barLabel}>{t.day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Role distribution */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Team Composition</Text>
        <View style={styles.roleGrid}>
          {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => {
            const pct = totalEmployees > 0 ? (count / totalEmployees) * 100 : 0;
            const color = ROLE_COLORS[role] || '#6B7280';
            return (
              <View key={role} style={styles.roleItem}>
                <View style={styles.roleHeader}>
                  <View style={[styles.roleDot, { backgroundColor: color }]} />
                  <Text style={styles.roleLabel}>{role.replace('_', ' ')}</Text>
                  <Text style={styles.roleCount}>{count}</Text>
                </View>
                <View style={styles.roleBarTrack}>
                  <View style={[styles.roleBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Employee status donut-like display */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Employee Status</Text>
        <View style={styles.statusRow}>
          {Object.entries(statusCounts).filter(([, v]) => v > 0).map(([status, count]) => {
            const color = STATUS_COLORS[status] || '#6B7280';
            const pct = totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0;
            return (
              <View key={status} style={styles.statusItem}>
                <View style={[styles.statusRing, { borderColor: color }]}>
                  <Text style={[styles.statusRingNum, { color }]}>{count}</Text>
                </View>
                <Text style={styles.statusLabel}>{status.replace('_', ' ')}</Text>
                <Text style={styles.statusPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Most Present */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="trophy" size={18} color="#F59E0B" />
          <Text style={styles.cardTitle}>Most Present This Month</Text>
        </View>
        <Text style={styles.cardSubtitle}>{workingDays} working days so far</Text>
        {mostPresent.map((u, i) => {
          const pct = workingDays > 0 ? (u.days / workingDays) * 100 : 0;
          return (
            <View key={u._id} style={styles.leaderRow}>
              <View style={[styles.rankBadge, i === 0 && styles.rankGold, i === 1 && styles.rankSilver, i === 2 && styles.rankBronze]}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={styles.leaderInfo}>
                <View style={styles.leaderTop}>
                  <Text style={styles.leaderName}>{u.name}</Text>
                  <Text style={styles.leaderDays}>{u.days}/{workingDays} days</Text>
                </View>
                <View style={styles.leaderBarTrack}>
                  <View style={[styles.leaderBarFill, { width: `${pct}%`, backgroundColor: '#10B981' }]} />
                </View>
              </View>
            </View>
          );
        })}
        {mostPresent.length === 0 && <Text style={styles.emptySmall}>No data yet</Text>}
      </View>

      {/* Most Absent */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="warning" size={18} color="#EF4444" />
          <Text style={styles.cardTitle}>Most Absent This Month</Text>
        </View>
        <Text style={styles.cardSubtitle}>{workingDays} working days so far</Text>
        {mostAbsent.map((u, i) => {
          const pct = workingDays > 0 ? (u.days / workingDays) * 100 : 0;
          return (
            <View key={u._id} style={styles.leaderRow}>
              <View style={[styles.rankBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.rankText, { color: '#EF4444' }]}>{i + 1}</Text>
              </View>
              <View style={styles.leaderInfo}>
                <View style={styles.leaderTop}>
                  <Text style={styles.leaderName}>{u.name}</Text>
                  <Text style={[styles.leaderDays, { color: '#EF4444' }]}>{u.days} days absent</Text>
                </View>
                <View style={styles.leaderBarTrack}>
                  <View style={[styles.leaderBarFill, { width: `${pct}%`, backgroundColor: '#EF4444' }]} />
                </View>
              </View>
            </View>
          );
        })}
        {mostAbsent.length === 0 && <Text style={styles.emptySmall}>No data yet</Text>}
      </View>

      {/* Recent Joinings */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="person-add" size={18} color={Theme.colors.primary} />
          <Text style={styles.cardTitle}>Recent Joinings</Text>
        </View>
        {recentJoinings.length === 0 ? (
          <View style={styles.emptyJoin}>
            <Ionicons name="happy-outline" size={32} color={Theme.colors.border} />
            <Text style={styles.emptySmall}>No new joinings in the last 30 days</Text>
          </View>
        ) : (
          recentJoinings.map((u, i) => (
            <View key={u._id} style={[styles.joinRow, i < recentJoinings.length - 1 && styles.joinBorder]}>
              <View style={styles.joinAvatar}>
                <Text style={styles.joinAvatarText}>{(u.name || 'U').substring(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.joinInfo}>
                <Text style={styles.joinName}>{u.name}</Text>
                <Text style={styles.joinRole}>{u.designation || u.role}</Text>
              </View>
              <View style={styles.joinDateBadge}>
                <Ionicons name="time-outline" size={12} color={Theme.colors.primary} />
                <Text style={styles.joinDateText}>{formatJoinDate(u.joinDate)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function StatCard({ icon, color, label, value }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  content: { padding: CARD_PAD },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  errorText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.textSecondary, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Theme.colors.primary, borderRadius: 20 },
  retryText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: '#fff', fontWeight: Theme.typography.weights.bold },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    gap: 14,
  },
  bannerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '800', color: '#fff' },
  bannerSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Stat cards
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  statIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontFamily: Theme.typography.fontFamily, fontSize: 26, fontWeight: '800', color: Theme.colors.text },
  statLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardSubtitle: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginBottom: 12, marginTop: 2 },

  // Bar chart
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, marginTop: 16, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700', color: Theme.colors.textSecondary, marginBottom: 4 },
  barTrack: { flex: 1, width: '70%', backgroundColor: '#F3F4F6', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 6, fontWeight: '600' },

  // Role distribution
  roleGrid: { marginTop: 12, gap: 10 },
  roleItem: {},
  roleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  roleLabel: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text, textTransform: 'capitalize' },
  roleCount: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', color: Theme.colors.text },
  roleBarTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  roleBarFill: { height: '100%', borderRadius: 3 },

  // Status rings
  statusRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 14, flexWrap: 'wrap', gap: 10 },
  statusItem: { alignItems: 'center', minWidth: 70 },
  statusRing: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  statusRingNum: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800' },
  statusLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 6, textTransform: 'capitalize', fontWeight: '600' },
  statusPct: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '700' },

  // Leaderboard rows
  leaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  rankGold: { backgroundColor: '#FEF3C7' },
  rankSilver: { backgroundColor: '#E5E7EB' },
  rankBronze: { backgroundColor: '#FED7AA' },
  rankText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', color: Theme.colors.text },
  leaderInfo: { flex: 1 },
  leaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  leaderName: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  leaderDays: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '700', color: '#10B981' },
  leaderBarTrack: { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  leaderBarFill: { height: '100%', borderRadius: 3 },

  // Join rows
  joinRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  joinBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  joinAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center',
  },
  joinAvatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
  joinInfo: { flex: 1 },
  joinName: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  joinRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
  joinDateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Theme.colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  joinDateText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700', color: Theme.colors.primary },

  emptyJoin: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptySmall: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, textAlign: 'center' },
});
