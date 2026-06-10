import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { payrollApi } from '../../api';
import { Theme } from '../../theme/Theme';

const INR = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

export default function MyPayslipsScreen({ navigation }) {
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
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text, marginTop: 12 },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 18 },
});
