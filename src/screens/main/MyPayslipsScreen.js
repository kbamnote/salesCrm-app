import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { payrollApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const INR = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

const MONTHS = [
  { mm: '01', label: 'Jan' }, { mm: '02', label: 'Feb' }, { mm: '03', label: 'Mar' },
  { mm: '04', label: 'Apr' }, { mm: '05', label: 'May' }, { mm: '06', label: 'Jun' },
  { mm: '07', label: 'Jul' }, { mm: '08', label: 'Aug' }, { mm: '09', label: 'Sep' },
  { mm: '10', label: 'Oct' }, { mm: '11', label: 'Nov' }, { mm: '12', label: 'Dec' },
];

// ───────────────────────── Admin: Salary Spend ─────────────────────────
function SalarySpendView() {
  const thisYear = String(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [years, setYears] = useState([thisYear]);
  const [selectedYear, setSelectedYear] = useState(thisYear);
  const [selectedMonth, setSelectedMonth] = useState(null); // 'MM' or null = all
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (year = selectedYear, month = selectedMonth) => {
    try {
      const params = month ? { month: `${year}-${month}` } : { year };
      const res = await payrollApi.salarySpend(params);
      setData(res.data);
      if (res.data?.years?.length) setYears(res.data.years);
    } catch (e) {
      console.log('Salary spend error', e?.message);
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [selectedYear, selectedMonth]));

  const pickYear = (y) => { setSelectedMonth(null); setSelectedYear(y); };
  const pickMonth = (mm) => setSelectedMonth((cur) => (cur === mm ? null : mm));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  const months = data?.months || [];
  const netTotal = data?.netTotal || 0;
  const grossTotal = data?.grossTotal || 0;
  const payslipCount = data?.payslipCount || 0;
  const filterLabel = selectedMonth
    ? `${MONTHS.find((m) => m.mm === selectedMonth)?.label} ${selectedYear}`
    : `Year ${selectedYear}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
    >
      {/* Total spend card */}
      <View style={styles.spendCard}>
        <Text style={styles.spendLabel}>Total Salary Spent · {filterLabel}</Text>
        <Text style={styles.spendValue}>{INR(netTotal)}</Text>
        <View style={styles.spendMetaRow}>
          <View style={styles.spendMetaItem}>
            <Ionicons name="cash-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.spendMeta}>Gross {INR(grossTotal)}</Text>
          </View>
          <View style={styles.spendMetaItem}>
            <Ionicons name="receipt-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.spendMeta}>{payslipCount} payslip{payslipCount === 1 ? '' : 's'}</Text>
          </View>
        </View>
      </View>

      {/* Year filter */}
      <Text style={styles.filterHeading}>Year</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {years.map((y) => (
          <TouchableOpacity key={y} style={[styles.chip, selectedYear === y && styles.chipActive]} onPress={() => pickYear(y)}>
            <Text style={[styles.chipText, selectedYear === y && styles.chipTextActive]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month filter */}
      <Text style={styles.filterHeading}>Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        <TouchableOpacity style={[styles.chip, !selectedMonth && styles.chipActive]} onPress={() => setSelectedMonth(null)}>
          <Text style={[styles.chipText, !selectedMonth && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {MONTHS.map((m) => (
          <TouchableOpacity key={m.mm} style={[styles.chip, selectedMonth === m.mm && styles.chipActive]} onPress={() => pickMonth(m.mm)}>
            <Text style={[styles.chipText, selectedMonth === m.mm && styles.chipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month-wise breakdown */}
      <Text style={styles.filterHeading}>Breakdown</Text>
      {months.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={44} color={Theme.colors.border} />
          <Text style={styles.emptyText}>No payslips for {filterLabel}</Text>
        </View>
      ) : (
        months.map((m) => (
          <View key={m.month} style={styles.breakRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="calendar-outline" size={20} color={Theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.month}>{m.monthLabel}</Text>
              <Text style={styles.sub}>{m.count} employee{m.count === 1 ? '' : 's'} · Gross {INR(m.grossTotal)}</Text>
            </View>
            <Text style={styles.breakAmount}>{INR(m.netTotal)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ───────────────────────── Employee: own payslips ─────────────────────────
function MyPayslipsList({ navigation }) {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await payrollApi.listPayslips();
      setSlips(res.data || []);
    } catch (e) {
      console.log('My payslips error', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={slips}
        keyExtractor={(it) => it._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('PayslipDetail', { payslipId: item._id, payslip: item })}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="receipt-outline" size={22} color={Theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.month}>{item.monthLabel}</Text>
              <Text style={styles.sub}>Net Pay · {INR(item.netPayable)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No payslips available yet</Text>
            <Text style={styles.emptySub}>Your payslips will appear here once HR generates them.</Text>
          </View>
        }
      />
    </View>
  );
}

export default function MyPayslipsScreen({ navigation }) {
  const { user } = useAuth();
  if (user?.role === 'admin') return <SalarySpendView />;
  return <MyPayslipsList navigation={navigation} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  sub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text, marginTop: 12 },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  // Salary spend
  spendCard: {
    backgroundColor: Theme.colors.primary, borderRadius: 16, padding: 20, marginBottom: 8,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8,
  },
  spendLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  spendValue: { fontFamily: Theme.typography.fontFamily, fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 6 },
  spendMetaRow: { flexDirection: 'row', gap: 18, marginTop: 12 },
  spendMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spendMeta: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  filterHeading: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.textSecondary, marginTop: 18, marginBottom: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Theme.colors.border,
  },
  chipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  breakRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  breakAmount: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.primary },
});
