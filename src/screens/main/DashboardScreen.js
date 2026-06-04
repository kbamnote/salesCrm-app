import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { targetsApi, leadsApi, clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [targetData, setTargetData] = useState(null);
  const [stats, setStats] = useState({ leads: 0, clients: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  const loadData = async () => {
    const [targetRes, leadsRes, clientsRes] = await Promise.allSettled([
      targetsApi.myTarget(currentMonth),
      leadsApi.list(),
      clientsApi.list(),
    ]);

    if (targetRes.status === 'fulfilled') {
      setTargetData(targetRes.value.data);
    } else {
      setTargetData(null);
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
  
  // Dummy chart data matching the UI provided
  const simpleChartData = [
    { label: 'Apr', value: 40 },
    { label: 'May', value: 80 },
    { label: 'Jun', value: 60 },
    { label: 'Jul', value: 100 },
  ];

  const salesProgressData = [
    { label: 'Jan', blue: 30, green: 60 },
    { label: 'Feb', blue: 45, green: 75 },
    { label: 'Mar', blue: 20, green: 40 },
    { label: 'Apr', blue: 50, green: 110 },
    { label: 'May', blue: 65, green: 140, isMax: true },
    { label: 'Jun', blue: 55, green: 90 },
    { label: 'Jul', blue: 50, green: 80 },
  ];

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
                <Text style={styles.increaseText}>+1.7% This month</Text>
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

        {/* Segmented Control Card */}
        <View style={styles.analyticsCard}>
          <View style={styles.segmentContainer}>
            {['Overview', 'Analytic', 'Operation'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.segmentTab, activeTab === tab && styles.segmentTabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.segmentTabText, activeTab === tab && styles.segmentTabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Simple Chart Section */}
          <View style={styles.simpleChartRow}>
            <View style={styles.simpleChartLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
                <Text style={styles.bigStatNumber}>9,567</Text>
                <View style={styles.greenBadge}>
                  <Ionicons name="trending-up" size={12} color={Theme.colors.accent} />
                  <Text style={styles.greenBadgeText}>1.756</Text>
                </View>
              </View>
              <Text style={styles.statDescription}>Your sales increased this month by around 56%</Text>
            </View>
            
            <View style={styles.simpleChartBars}>
              {simpleChartData.map((item, index) => (
                <View key={index} style={styles.barColumn}>
                  <View style={[styles.singleBar, { height: item.value }]} />
                  <Text style={styles.barLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Sales Progress Card */}
        <View style={styles.salesProgressCard}>
          <View style={styles.salesProgressHeader}>
            <Text style={styles.cardTitle}>Sales Progress</Text>
            <TouchableOpacity style={styles.monthDropdown}>
              <Text style={styles.monthDropdownText}>Month</Text>
              <Ionicons name="chevron-down" size={14} color={Theme.colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.multiChartContainer}>
            {/* Y-Axis Labels */}
            <View style={styles.yAxis}>
              <Text style={styles.yAxisText}>1M</Text>
              <Text style={styles.yAxisText}>50k</Text>
              <Text style={styles.yAxisText}>25k</Text>
              <Text style={styles.yAxisText}>0</Text>
            </View>

            {/* Bars */}
            <View style={styles.multiBarsWrapper}>
              {salesProgressData.map((item, index) => (
                <View key={index} style={styles.multiBarColumn}>
                  {item.isMax && (
                    <Ionicons name="trophy" size={16} color="#F59E0B" style={{ marginBottom: 4 }} />
                  )}
                  <View style={styles.multiBarPair}>
                    <View style={[styles.blueBar, { height: item.blue }]} />
                    <View style={[styles.greenBar, { height: item.green }]} />
                  </View>
                  <Text style={styles.barLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
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
