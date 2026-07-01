import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Dimensions, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { telecallerDashApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const { width: SW } = Dimensions.get('window');

const OUTCOME_META = {
  interested: { label: 'Interested', icon: 'thumbs-up', color: '#10B981' },
  not_interested: { label: 'Not Interested', icon: 'thumbs-down', color: '#EF4444' },
  meeting_fixed: { label: 'Meeting Fixed', icon: 'calendar', color: '#3B82F6' },
  callback: { label: 'Callback', icon: 'call', color: '#F59E0B' },
  no_answer: { label: 'No Answer', icon: 'call-outline', color: '#6B7280' },
};

const STATUS_COLOR = {
  new: '#4a90e2', contacted: '#3B82F6', qualified: '#06B6D4', proposal: '#F59E0B',
  negotiation: '#F97316', won: '#10B981', converted: '#22C55E', lost: '#EF4444', dropped: '#6B7280',
};

const SOURCE_COLORS = ['#4a90e2', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function TelecallerDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await telecallerDashApi.stats();
      setData(res.data);
    } catch (e) {
      console.log('Telecaller dash error', e);
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

  const {
    today, leads, calls, pipeline, sourceCounts, weekTrend, recentLeads, recentCalls,
    telecallerStats = [], isAdminView = false,
  } = data;
  const maxWeek = Math.max(...weekTrend.map(t => t.calls), 1);
  const totalOutcomes = Object.values(calls.outcomeCounts).reduce((a, b) => a + b, 0) || 1;
  const sortedSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const maxSource = sortedSources.length ? sortedSources[0][1] : 1;

  const fmtDuration = (sec) => {
    if (!sec) return '0m';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const timeAgo = (d) => {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.banner}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'Telecaller'}</Text>
          <Text style={styles.bannerSub}>
            {isAdminView
              ? 'Telecaller team overview'
              : new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={styles.bannerIcon}>
          <Ionicons name="headset" size={28} color="#fff" />
        </View>
      </View>

      {/* Today's activity */}
      <Text style={styles.sectionTitle}>Today's Activity</Text>
      <View style={styles.todayRow}>
        <TodayCard icon="call" color={Theme.colors.primary} value={today.calls} label="Calls Made" />
        <TodayCard icon="person-add" color="#10B981" value={today.leads} label="New Leads" />
        <TodayCard icon="time" color="#F59E0B" value={fmtDuration(today.talkTime)} label="Talk Time" small />
      </View>

      {/* Quick stats */}
      <View style={styles.quickRow}>
        <QuickStat value={leads.total} label={isAdminView ? 'Team Leads' : 'Total Leads'} color={Theme.colors.primary} />
        <QuickStat value={leads.active} label="Active" color="#3B82F6" />
        <QuickStat value={leads.converted} label="Converted" color="#10B981" />
        <QuickStat value={calls.total} label="Total Calls" color="#F97316" />
      </View>

      {/* Per-telecaller tracking (admin view) */}
      {isAdminView && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="people-circle" size={18} color={Theme.colors.primary} />
            <Text style={styles.cardTitle}>Telecaller Tracking</Text>
          </View>
          {telecallerStats.length === 0 ? (
            <Text style={styles.emptySmall}>No telecallers found</Text>
          ) : (
            telecallerStats.map((t, i) => (
              <View key={t.id} style={[styles.recentRow, i < telecallerStats.length - 1 && styles.recentBorder]}>
                <View style={styles.leadAvatar}>
                  <Text style={styles.leadAvatarText}>{(t.name || 'U').substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{t.name}</Text>
                  <View style={styles.recentMeta}>
                    <Text style={styles.tcStat}>{t.leads} leads</Text>
                    <Text style={styles.tcDot}>•</Text>
                    <Text style={styles.tcStat}>{t.calls} calls</Text>
                    <Text style={styles.tcDot}>•</Text>
                    <Text style={[styles.tcStat, { color: '#10B981' }]}>{t.converted} won</Text>
                  </View>
                </View>
                <View style={styles.tcTodayWrap}>
                  <Text style={styles.tcTodayNum}>{t.todayCalls}</Text>
                  <Text style={styles.tcTodayLbl}>calls today</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Weekly calls trend */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Calls This Week</Text>
        <View style={styles.chartContainer}>
          {weekTrend.map((t, i) => {
            const barH = maxWeek > 0 ? (t.calls / maxWeek) * 100 : 0;
            const isToday = i === weekTrend.length - 1;
            return (
              <View key={i} style={styles.barCol}>
                <Text style={[styles.barValue, isToday && { color: Theme.colors.primary, fontWeight: '800' }]}>{t.calls}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, {
                    height: `${Math.max(barH, 4)}%`,
                    backgroundColor: isToday ? Theme.colors.primary : Theme.colors.primaryLight,
                  }]} />
                </View>
                <Text style={[styles.barLabel, isToday && { color: Theme.colors.primary, fontWeight: '800' }]}>{t.day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Call outcomes donut-style */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Outcomes</Text>
        {Object.keys(calls.outcomeCounts).length === 0 ? (
          <Text style={styles.emptySmall}>No calls recorded yet</Text>
        ) : (
          <>
            <View style={styles.outcomeBar}>
              {Object.entries(calls.outcomeCounts).map(([key, count]) => {
                const meta = OUTCOME_META[key] || { color: '#6B7280' };
                const pct = (count / totalOutcomes) * 100;
                return (
                  <View key={key} style={[styles.outcomeSegment, { width: `${pct}%`, backgroundColor: meta.color }]} />
                );
              })}
            </View>
            <View style={styles.outcomeGrid}>
              {Object.entries(calls.outcomeCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                const meta = OUTCOME_META[key] || { label: key, icon: 'ellipse', color: '#6B7280' };
                const pct = Math.round((count / totalOutcomes) * 100);
                return (
                  <View key={key} style={styles.outcomeItem}>
                    <View style={[styles.outcomeDot, { backgroundColor: meta.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.outcomeLabel}>{meta.label}</Text>
                      <Text style={styles.outcomeCount}>{count} ({pct}%)</Text>
                    </View>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Lead pipeline funnel */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lead Pipeline</Text>
        <View style={styles.pipelineContainer}>
          {pipeline.filter(p => p.count > 0).map((p, i) => {
            const maxCount = Math.max(...pipeline.map(x => x.count), 1);
            const barW = (p.count / maxCount) * 100;
            return (
              <View key={p.key} style={styles.pipelineRow}>
                <Text style={styles.pipelineLabel}>{p.label}</Text>
                <View style={styles.pipelineTrack}>
                  <View style={[styles.pipelineFill, { width: `${Math.max(barW, 5)}%`, backgroundColor: p.color }]} />
                </View>
                <Text style={[styles.pipelineCount, { color: p.color }]}>{p.count}</Text>
              </View>
            );
          })}
          {pipeline.every(p => p.count === 0) && <Text style={styles.emptySmall}>No leads yet</Text>}
        </View>
      </View>

      {/* Lead sources */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lead Sources</Text>
        {sortedSources.length === 0 ? (
          <Text style={styles.emptySmall}>No data</Text>
        ) : (
          <View style={styles.sourceContainer}>
            {sortedSources.map(([src, count], i) => {
              const color = SOURCE_COLORS[i % SOURCE_COLORS.length];
              const pct = (count / maxSource) * 100;
              return (
                <View key={src} style={styles.sourceRow}>
                  <View style={styles.sourceLeft}>
                    <View style={[styles.sourceDot, { backgroundColor: color }]} />
                    <Text style={styles.sourceLabel}>{src}</Text>
                  </View>
                  <View style={styles.sourceBarTrack}>
                    <View style={[styles.sourceBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.sourceCount, { color }]}>{count}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Recent calls */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="call" size={16} color={Theme.colors.primary} />
          <Text style={styles.cardTitle}>Recent Calls</Text>
        </View>
        {recentCalls.length === 0 ? (
          <Text style={styles.emptySmall}>No calls yet</Text>
        ) : (
          recentCalls.map((c, i) => {
            const meta = OUTCOME_META[c.outcome] || { label: c.outcome || 'Unknown', color: '#6B7280', icon: 'ellipse' };
            return (
              <View key={c._id || i} style={[styles.recentRow, i < recentCalls.length - 1 && styles.recentBorder]}>
                <View style={[styles.recentIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{c.clientName || 'Unknown'}</Text>
                  <View style={styles.recentMeta}>
                    <View style={[styles.recentChip, { backgroundColor: meta.color + '15' }]}>
                      <Text style={[styles.recentChipText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {c.duration ? <Text style={styles.recentDur}>{fmtDuration(c.duration)}</Text> : null}
                  </View>
                </View>
                <Text style={styles.recentTime}>{timeAgo(c.date || c.createdAt)}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Recent leads */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="people" size={16} color="#10B981" />
          <Text style={styles.cardTitle}>Recent Leads</Text>
        </View>
        {recentLeads.length === 0 ? (
          <Text style={styles.emptySmall}>No leads yet</Text>
        ) : (
          recentLeads.map((l, i) => {
            const sColor = STATUS_COLOR[l.status] || '#6B7280';
            return (
              <TouchableOpacity
                key={l._id || i}
                style={[styles.recentRow, i < recentLeads.length - 1 && styles.recentBorder]}
                onPress={() => navigation.navigate('LeadDetail', { leadId: l._id })}
                activeOpacity={0.7}
              >
                <View style={styles.leadAvatar}>
                  <Text style={styles.leadAvatarText}>{(l.name || 'U').substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{l.name}</Text>
                  <View style={styles.recentMeta}>
                    <View style={[styles.recentChip, { backgroundColor: sColor + '15' }]}>
                      <Text style={[styles.recentChipText, { color: sColor }]}>{l.status}</Text>
                    </View>
                    {l.source ? <Text style={styles.recentDur}>{l.source}</Text> : null}
                  </View>
                </View>
                <Text style={styles.recentTime}>{timeAgo(l.createdAt)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function TodayCard({ icon, color, value, label, small }) {
  return (
    <View style={styles.todayCard}>
      <View style={[styles.todayIconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.todayValue, small && { fontSize: 18 }]}>{value}</Text>
      <Text style={styles.todayLabel}>{label}</Text>
    </View>
  );
}

function QuickStat({ value, label, color }) {
  return (
    <View style={styles.quickItem}>
      <Text style={[styles.quickValue, { color }]}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  errorText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Theme.colors.primary, borderRadius: 20 },
  retryText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: '#fff', fontWeight: '700' },

  // Banner
  banner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Theme.colors.primary, borderRadius: 16, padding: 20, marginBottom: 18,
  },
  greeting: { fontFamily: Theme.typography.fontFamily, fontSize: 22, fontWeight: '800', color: '#fff' },
  bannerSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  bannerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  sectionTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text, marginBottom: 10 },

  // Today cards
  todayRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  todayCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  todayIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  todayValue: { fontFamily: Theme.typography.fontFamily, fontSize: 22, fontWeight: '800', color: Theme.colors.text },
  todayLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  // Quick stats
  quickRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, gap: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  quickItem: { flex: 1, alignItems: 'center' },
  quickValue: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '800' },
  quickLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },

  // Bar chart
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, marginTop: 14, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700', color: Theme.colors.textSecondary, marginBottom: 4 },
  barTrack: { flex: 1, width: '65%', backgroundColor: '#F3F4F6', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 6, fontWeight: '600' },

  // Outcome stacked bar
  outcomeBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 14, marginBottom: 12 },
  outcomeSegment: { height: '100%' },
  outcomeGrid: { gap: 8 },
  outcomeItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outcomeDot: { width: 8, height: 8, borderRadius: 4 },
  outcomeLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text },
  outcomeCount: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary },

  // Pipeline
  pipelineContainer: { marginTop: 12, gap: 8 },
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pipelineLabel: { width: 80, fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '600', color: Theme.colors.text },
  pipelineTrack: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  pipelineFill: { height: '100%', borderRadius: 4 },
  pipelineCount: { width: 28, fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', textAlign: 'right' },

  // Sources
  sourceContainer: { marginTop: 12, gap: 10 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 90 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  sourceLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '600', color: Theme.colors.text, flex: 1 },
  sourceBarTrack: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  sourceBarFill: { height: '100%', borderRadius: 4 },
  sourceCount: { width: 28, fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', textAlign: 'right' },

  // Recent rows
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  recentBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  recentIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  recentInfo: { flex: 1 },
  recentName: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  recentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  recentChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  recentChipText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  recentDur: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600' },
  recentTime: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary },

  leadAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center',
  },
  leadAvatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },

  // Telecaller tracking
  tcStat: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '600' },
  tcDot: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.border },
  tcTodayWrap: { alignItems: 'center', minWidth: 52 },
  tcTodayNum: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.primary },
  tcTodayLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 9, color: Theme.colors.textSecondary, fontWeight: '600' },

  emptySmall: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, textAlign: 'center', paddingVertical: 16 },
});
