import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { targetsApi, leadsApi, clientsApi, dealsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [targetData, setTargetData] = useState(null);
  const [stats, setStats] = useState({ leads: 0, clients: 0 });
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  const loadData = async () => {
    const [targetRes, leadsRes, clientsRes, monthlyRes] = await Promise.allSettled([
      targetsApi.myTarget(currentMonth),
      leadsApi.list(),
      clientsApi.list(),
      dealsApi.monthly(6),
    ]);

    if (targetRes.status === 'fulfilled') {
      setTargetData(targetRes.value.data);
    } else {
      setTargetData(null);
    }

    if (monthlyRes.status === 'fulfilled') {
      setMonthly(monthlyRes.value.data || []);
    }

    if (leadsRes.status === 'fulfilled') {
      const leadsData = leadsRes.value.data || [];
      const clientsData = clientsRes.status === 'fulfilled' ? (clientsRes.value.data || []) : [];
      setStats({ leads: leadsData.length, clients: clientsData.length });
    }

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  const achieved = targetData?.achieved || 0;
  const target = targetData?.target || 0;
  const percentage = targetData?.percentage || 0;
  const dealsCount = targetData?.dealsCount || 0;
  const remaining = Math.max(target - achieved, 0);
  const progressWidth = Math.min(percentage, 100);
  const monthLabel = new Date().toLocaleString('default', { month: 'long' });

  // Real monthly chart data — achieved (revenue) vs assigned target.
  const CHART_HEIGHT = 140;
  const maxVal = Math.max(...monthly.map((m) => Math.max(m.revenue, m.target || 0)), 1);
  const hasData = monthly.some((m) => m.revenue > 0 || (m.target || 0) > 0);
  const fmtShort = (n) =>
    n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  const barH = (v) => Math.max((v / maxVal) * (CHART_HEIGHT - 18), v > 0 ? 4 : 0);

  return (
    <View style={styles.container}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.white} />}
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* Blue Header Section */}
        <View style={styles.headerBackground}>
          <SafeAreaView edges={['top']} style={styles.safeArea}>
            {/* Top Nav */}
            <View style={styles.topNav}>
              <TouchableOpacity onPress={() => navigation.openDrawer()}>
                <Ionicons name="grid-outline" size={24} color={Theme.colors.white} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Welcome Back</Text>
              <TouchableOpacity>
                <Ionicons name="ellipsis-horizontal" size={24} color={Theme.colors.white} />
              </TouchableOpacity>
            </View>

            {/* Balance Info */}
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Total Target Achieved</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceValue}>₹{achieved.toLocaleString()}</Text>
                <TouchableOpacity style={styles.monthBadge}>
                  <Text style={styles.monthBadgeText}>Month</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.increaseRow}>
                <Ionicons name="trending-up" size={14} color={Theme.colors.white} />
                <Text style={styles.increaseText}>
                  {target > 0 ? `${percentage}% of ₹${target.toLocaleString('en-IN')} target` : 'No target set yet'}
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Floating Pill Buttons */}
        <View style={styles.floatingButtonsContainer}>
          <TouchableOpacity style={styles.floatingButton} onPress={() => navigation.navigate('Clients')}>
            <Ionicons name="people-outline" size={20} color={Theme.colors.primary} />
            <Text style={styles.floatingButtonText}>Clients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatingButton} onPress={() => navigation.navigate('Leads')}>
            <Ionicons name="funnel-outline" size={20} color={Theme.colors.primary} />
            <Text style={styles.floatingButtonText}>Leads</Text>
          </TouchableOpacity>
        </View>

        {/* Close Deal CTA */}
        <TouchableOpacity style={styles.closeDealBtn} onPress={() => navigation.navigate('CloseDeal')}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.closeDealText}>Close a Deal</Text>
        </TouchableOpacity>

        {/* Target Progress Card */}
        <View style={styles.analyticsCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{monthLabel} Target</Text>
            <Text style={styles.percentBadge}>{percentage}%</Text>
          </View>

          {target > 0 ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
              </View>
              <View style={styles.targetRow}>
                <Text style={styles.targetMuted}>Achieved: ₹{achieved.toLocaleString('en-IN')}</Text>
                <Text style={styles.targetMuted}>Target: ₹{target.toLocaleString('en-IN')}</Text>
              </View>
              <Text style={styles.remainingText}>
                {remaining > 0
                  ? `₹${remaining.toLocaleString('en-IN')} to go`
                  : '🎉 Target achieved!'}
              </Text>
            </>
          ) : (
            <Text style={styles.noTargetText}>
              No target set for this month yet. Your manager can assign one.
            </Text>
          )}
        </View>

        {/* Real Stat Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Ionicons name="briefcase-outline" size={22} color={Theme.colors.primary} />
            <Text style={styles.statTileNumber}>{dealsCount}</Text>
            <Text style={styles.statTileLabel}>Deals (Month)</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="cash-outline" size={22} color={Theme.colors.success} />
            <Text style={styles.statTileNumber}>₹{achieved.toLocaleString('en-IN')}</Text>
            <Text style={styles.statTileLabel}>Revenue</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="funnel-outline" size={22} color="#F59E0B" />
            <Text style={styles.statTileNumber}>{stats.leads}</Text>
            <Text style={styles.statTileLabel}>Leads</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="people-outline" size={22} color="#8B5CF6" />
            <Text style={styles.statTileNumber}>{stats.clients}</Text>
            <Text style={styles.statTileLabel}>Clients</Text>
          </View>
        </View>

        {/* Sales Progress Chart — achieved vs target, last 6 months */}
        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Sales Progress</Text>
          <Text style={styles.chartSub}>Achieved vs Target · last 6 months</Text>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Theme.colors.success }]} />
              <Text style={styles.legendText}>Achieved</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Theme.colors.primary }]} />
              <Text style={styles.legendText}>Target</Text>
            </View>
          </View>

          {hasData ? (
            <View style={styles.chartBody}>
              {/* Y-axis */}
              <View style={[styles.yAxis, { height: CHART_HEIGHT }]}>
                <Text style={styles.yAxisText}>₹{fmtShort(maxVal)}</Text>
                <Text style={styles.yAxisText}>₹{fmtShort(maxVal / 2)}</Text>
                <Text style={styles.yAxisText}>0</Text>
              </View>

              {/* Grouped bars */}
              <View style={[styles.chartBars, { height: CHART_HEIGHT }]}>
                {monthly.map((m, i) => (
                  <View key={m.month || i} style={styles.chartCol}>
                    <View style={styles.barPair}>
                      <View style={[styles.chartBar, { height: barH(m.revenue), backgroundColor: Theme.colors.success }]} />
                      <View style={[styles.chartBar, { height: barH(m.target || 0), backgroundColor: Theme.colors.primary }]} />
                    </View>
                    <Text style={styles.barLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={40} color={Theme.colors.border} />
              <Text style={styles.chartEmptyText}>No deals or targets yet. Set a target and close a deal to see your progress here.</Text>
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  headerBackground: {
    backgroundColor: Theme.colors.primary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingBottom: 50, // Space for overlapping buttons
  },
  safeArea: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerTitle: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Theme.typography.fontFamily,
  },
  balanceContainer: {
    marginBottom: 20,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontFamily: Theme.typography.fontFamily,
    marginBottom: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  balanceValue: {
    color: Theme.colors.white,
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: Theme.typography.fontFamily,
  },
  monthBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  monthBadgeText: {
    color: Theme.colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  increaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  increaseText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginLeft: 4,
  },
  floatingButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: -25,
    paddingHorizontal: 20,
    gap: 15,
    zIndex: 10,
  },
  floatingButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Theme.colors.white,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  floatingButtonText: {
    color: Theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  closeDealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.colors.success,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  closeDealText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  percentBadge: { fontSize: 16, fontWeight: 'bold', color: Theme.colors.primary },
  progressTrack: { height: 12, backgroundColor: '#EEF2F7', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Theme.colors.success, borderRadius: 6 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  targetMuted: { fontSize: 12, color: Theme.colors.textSecondary },
  remainingText: { marginTop: 8, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  noTargetText: { fontSize: 13, color: Theme.colors.textSecondary, lineHeight: 18 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  statTile: {
    width: '48%',
    backgroundColor: Theme.colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  statTileNumber: { fontSize: 18, fontWeight: 'bold', color: Theme.colors.text, marginTop: 8 },
  statTileLabel: { fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2 },
  chartCard: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  chartSub: { fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2, marginBottom: 16 },
  chartBody: { flexDirection: 'row' },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  chartCol: { alignItems: 'center', justifyContent: 'flex-end', flex: 1 },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  chartBar: { width: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barValue: { fontSize: 9, color: Theme.colors.textSecondary, marginBottom: 4 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Theme.colors.textSecondary },
  chartEmpty: { alignItems: 'center', paddingVertical: 20 },
  chartEmptyText: { fontSize: 13, color: Theme.colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  analyticsCard: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentTabActive: {
    backgroundColor: Theme.colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentTabText: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  segmentTabTextActive: {
    color: Theme.colors.text,
  },
  simpleChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  simpleChartLeft: {
    flex: 1,
    paddingRight: 20,
  },
  bigStatNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Theme.colors.text,
    marginRight: 8,
  },
  greenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  greenBadgeText: {
    color: Theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  statDescription: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    lineHeight: 16,
  },
  simpleChartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  barColumn: {
    alignItems: 'center',
  },
  singleBar: {
    width: 12,
    backgroundColor: Theme.colors.primary,
    borderRadius: 6,
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 10,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  salesProgressCard: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  salesProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Theme.colors.text,
  },
  monthDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7DB5F1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  monthDropdownText: {
    color: Theme.colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  multiChartContainer: {
    flexDirection: 'row',
    height: 160,
  },
  yAxis: {
    justifyContent: 'space-between',
    paddingRight: 10,
    paddingBottom: 20,
  },
  yAxisText: {
    fontSize: 10,
    color: Theme.colors.textSecondary,
  },
  multiBarsWrapper: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 20,
  },
  multiBarColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  multiBarPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  blueBar: {
    width: 8,
    backgroundColor: Theme.colors.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  greenBar: {
    width: 8,
    backgroundColor: Theme.colors.accent,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
});
