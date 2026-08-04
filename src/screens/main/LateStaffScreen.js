import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { attendanceApi } from '../../api';
import { Theme } from '../../theme/Theme';

const MONTH_LABEL = (m) => {
  const d = new Date(`${m}-01T00:00:00`);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
};
const shiftMonth = (offset = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ROLE_COLORS = {
  admin: '#4a90e2', manager: '#8B5CF6', bdo: '#EC4899', team_leader: '#F59E0B',
  sales: '#10B981', tms: '#06B6D4', tme: '#3B82F6', hr: '#EF4444',
  telecaller: '#F97316', designer: '#A855F7', assistant_hr: '#EC4899',
  social_media: '#F97316',
};

export default function LateStaffScreen() {
  const [month, setMonth] = useState(() => shiftMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (m) => {
    try {
      const res = await attendanceApi.lateStaff(m);
      setData(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load late-staff data';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load(month);
  }, [month]));

  const onRefresh = () => { setRefreshing(true); load(month); };
  const goMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setMonth(next);
    setLoading(true);
    load(next);
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading late staff...</Text>
      </View>
    );
  }

  const { totalStaff, totalLateDays, totalEarlyDays, staff = [], shift } = data || {};

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="alarm" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Late Staff</Text>
            <Text style={styles.bannerSub}>
              Shift {shift ? `${shift.start} – ${shift.end}` : ''}
              {shift?.graceMin ? ` · ${shift.graceMin} min grace` : ''}
            </Text>
          </View>
        </View>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>
          <View style={styles.monthCenter}>
            <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
            <Text style={styles.monthText}>{MONTH_LABEL(month)}</Text>
          </View>
          <TouchableOpacity onPress={() => goMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: Theme.colors.primary }]}>
            <Text style={styles.statValue}>{totalStaff || 0}</Text>
            <Text style={styles.statLabel}>Staff Flagged</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{totalLateDays || 0}</Text>
            <Text style={styles.statLabel}>Late Days</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#3B82F6' }]}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>{totalEarlyDays || 0}</Text>
            <Text style={styles.statLabel}>Early Leaves</Text>
          </View>
        </View>

        {/* List */}
        {staff.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-circle-outline" size={52} color="#10B981" />
            <Text style={styles.emptyTitle}>All on time! 🎉</Text>
            <Text style={styles.emptyText}>No late or early-leaving staff this month.</Text>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Ionicons name="list-outline" size={16} color={Theme.colors.textSecondary} />
              <Text style={styles.listHeaderText}>
                {staff.length} staff with attendance flags
              </Text>
            </View>

            {staff.map((s) => {
              const roleColor = ROLE_COLORS[s.role] || '#6B7280';
              return (
                <View key={s._id} style={styles.staffCard}>
                  <View style={styles.staffTopRow}>
                    <View style={[styles.avatar, { backgroundColor: roleColor + '20' }]}>
                      <Text style={[styles.avatarText, { color: roleColor }]}>
                        {(s.name || '?').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.staffInfo}>
                      <Text style={styles.staffName}>{s.name}</Text>
                      <Text style={[styles.staffRole, { color: roleColor }]}>
                        {s.role.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    {s.lateDays > 0 ? (
                      <View style={[styles.flagBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.flagBadgeText, { color: '#92400E' }]}>
                          {s.lateDays} late
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.flagBadge, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.flagBadgeText, { color: '#1E3A8A' }]}>
                          early
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metric}>
                      <Text style={styles.metricValue}>{s.lateDays}</Text>
                      <Text style={styles.metricLabel}>Days Late</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metric}>
                      <Text style={styles.metricValue}>{s.totalLateMinutes}</Text>
                      <Text style={styles.metricLabel}>Min Late</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metric}>
                      <Text style={styles.metricValue}>{s.avgLateMinutes}</Text>
                      <Text style={styles.metricLabel}>Avg Late</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metric}>
                      <Text style={[styles.metricValue, { color: '#3B82F6' }]}>{s.earlyDays}</Text>
                      <Text style={styles.metricLabel}>Early</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F5' },
  container: { flex: 1 },
  content: { padding: 16 },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F0F2F5', padding: 40,
  },
  loadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary, marginTop: 12,
  },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Theme.colors.primary,
    borderRadius: 16, padding: 18, marginBottom: 12,
  },
  bannerIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 20, fontWeight: '800', color: '#fff',
  },
  bannerSub: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2,
  },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 8,
    marginBottom: 12, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  monthArrow: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  monthCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    textTransform: 'capitalize',
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: 14, borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  statValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 24, fontWeight: '800', color: Theme.colors.text,
  },
  statLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, color: Theme.colors.textSecondary,
    marginTop: 2, fontWeight: '600',
  },

  listHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  listHeaderText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, fontWeight: '700',
    color: Theme.colors.textSecondary, textTransform: 'uppercase',
  },

  emptyBox: { alignItems: 'center', paddingVertical: 50 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 16, fontWeight: '800', color: Theme.colors.text,
    marginTop: 12,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary, marginTop: 6,
  },

  staffCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  staffTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700',
  },
  staffInfo: { flex: 1 },
  staffName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700', color: Theme.colors.text,
  },
  staffRole: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, fontWeight: '600', textTransform: 'capitalize', marginTop: 1,
  },
  flagBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  flagBadgeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, fontWeight: '700',
  },

  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 30, backgroundColor: '#EEF1F5' },
  metricValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 18, fontWeight: '800', color: Theme.colors.text,
  },
  metricLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10, color: Theme.colors.textSecondary,
    marginTop: 2, textTransform: 'uppercase', fontWeight: '600',
  },
});
