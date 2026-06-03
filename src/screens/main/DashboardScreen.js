import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { targetsApi, leadsApi, clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [targetData, setTargetData] = useState(null);
  const [targetAvailable, setTargetAvailable] = useState(true);
  const [stats, setStats] = useState({ leads: 0, clients: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  const loadData = async () => {
    // Load all in parallel, each fail independently
    const [targetRes, leadsRes, clientsRes] = await Promise.allSettled([
      targetsApi.myTarget(currentMonth),
      leadsApi.list(),
      clientsApi.list(),
    ]);

    if (targetRes.status === 'fulfilled') {
      setTargetData(targetRes.value.data);
      setTargetAvailable(true);
    } else {
      // 404 = endpoint not ready on backend yet, handle silently
      setTargetData(null);
      setTargetAvailable(targetRes.reason?.response?.status !== 404);
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

  const revenueTarget = targetData?.target || 0;
  const achieved = targetData?.achieved || 0;
  const progressPct = revenueTarget > 0 ? Math.min((achieved / revenueTarget) * 100, 100) : 0;

  const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />}
    >
      {/* Greeting Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.subtitle}>{monthName} — here's your overview</Text>
        </View>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarSmallText}>{user?.name?.substring(0, 1)?.toUpperCase() || 'U'}</Text>
        </View>
      </View>

      {/* Quick Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="funnel" size={20} color="#4F46E5" />
          <Text style={styles.statNumber}>{stats.leads}</Text>
          <Text style={styles.statLabel}>Leads</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="people" size={20} color="#10B981" />
          <Text style={styles.statNumber}>{stats.clients}</Text>
          <Text style={styles.statLabel}>Clients</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="calendar" size={20} color="#F59E0B" />
          <Text style={styles.statNumber}>{new Date().getDate()}</Text>
          <Text style={styles.statLabel}>Day</Text>
        </View>
      </View>

      {/* Monthly Target Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="trophy" size={24} color={Theme.colors.warning} />
          <Text style={styles.cardTitle}>Monthly Target</Text>
        </View>

        {targetData ? (
          <>
            <View style={styles.targetRow}>
              <View>
                <Text style={styles.statsLabel}>Achieved</Text>
                <Text style={styles.statsValuePositive}>₹{achieved.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.statsLabel}>Target</Text>
                <Text style={styles.statsValue}>₹{revenueTarget.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressText}>{progressPct.toFixed(1)}% Completed</Text>
          </>
        ) : (
          <View style={styles.noTarget}>
            <Ionicons name="bar-chart-outline" size={36} color={Theme.colors.border} />
            <Text style={styles.noTargetTitle}>No target set yet</Text>
            <Text style={styles.noTargetText}>Your manager hasn't assigned a target for {monthName}.</Text>
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionHeading}>Quick Actions</Text>
      <View style={styles.quickActionsGrid}>
        <ActionCard icon="call" title="Calls Log" color="#4F46E5" />
        <ActionCard icon="people" title="My Clients" color="#10B981" />
        <ActionCard icon="calendar" title="Meetings" color="#F59E0B" />
        <ActionCard icon="cash" title="My Deals" color="#EF4444" />
      </View>

    </ScrollView>
  );
}

function ActionCard({ icon, title, color }) {
  return (
    <View style={styles.actionCard}>
      <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.actionText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Theme.spacing.l,
    backgroundColor: Theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  greeting: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  subtitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.xs,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  // Quick stats
  statsRow: {
    flexDirection: 'row',
    padding: Theme.spacing.m,
    gap: Theme.spacing.s,
  },
  statCard: {
    flex: 1,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.m,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    gap: 4,
  },
  statNumber: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  statLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  // Target card
  card: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginBottom: Theme.spacing.m,
    padding: Theme.spacing.l,
    borderRadius: Theme.borderRadius.l,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.m,
  },
  cardTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginLeft: Theme.spacing.s,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.m,
  },
  statsLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  statsValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginTop: Theme.spacing.xs,
  },
  statsValuePositive: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.success,
    marginTop: Theme.spacing.xs,
  },
  progressContainer: {
    height: 12,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.round,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.round,
  },
  progressText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.s,
    textAlign: 'right',
  },
  noTarget: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.l,
  },
  noTargetTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.s,
  },
  noTargetText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  // Quick actions
  sectionHeading: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    paddingHorizontal: Theme.spacing.l,
    paddingBottom: Theme.spacing.s,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Theme.spacing.s,
    paddingBottom: Theme.spacing.xl,
  },
  actionCard: {
    width: '45%',
    backgroundColor: Theme.colors.white,
    margin: '2.5%',
    padding: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: Theme.borderRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.s,
  },
  actionText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.medium,
    color: Theme.colors.text,
  },
});
