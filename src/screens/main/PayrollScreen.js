import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { payrollApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function PayrollScreen({ navigation }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const res = await payrollApi.employees();
      setEmployees(res.data || []);
    } catch (e) {
      const status = e?.response?.status;
      const msg = status === 404
        ? 'Payroll service not found on the server. The backend may need to be deployed/updated.'
        : status === 403
        ? 'Your role isn’t allowed to manage payroll.'
        : (e?.response?.data?.error || e?.message || 'Could not load employees.');
      setError(msg);
      console.log('Payroll employees error', status, e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const filtered = employees.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.designation, e.department, e.employeeId, e.role]
      .filter(Boolean).some((v) => v.toLowerCase().includes(q));
  });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={Theme.colors.border} />
        <Text style={styles.errTitle}>Couldn’t load employees</Text>
        <Text style={styles.errMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search employee…"
          placeholderTextColor={Theme.colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(it) => it._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('PayrollEmployee', { employee: item })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(item.name || 'U').substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{item.designation || item.role}{item.department ? ` · ${item.department}` : ''}</Text>
            </View>
            <View style={[styles.badge, item.hasStructure ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={[styles.badgeText, item.hasStructure ? styles.badgeTextOk : styles.badgeTextWarn]}>
                {item.hasStructure ? 'Structure set' : 'Setup needed'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No employees found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text, padding: 0 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  sub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 3, textTransform: 'capitalize' },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeOk: { backgroundColor: '#D1FAE5' },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700' },
  badgeTextOk: { color: '#059669' },
  badgeTextWarn: { color: '#D97706' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text, marginTop: 12 },

  errTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: Theme.colors.text, marginTop: 12 },
  errMsg: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 36, lineHeight: 19 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: Theme.colors.primary, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22 },
  retryText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: '#fff' },
});
