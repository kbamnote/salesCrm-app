import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { leadsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import { Ionicons } from '@expo/vector-icons';

export default function LeadsScreen({ navigation }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Normalize different API response shapes: array, {leads:[...]}, {data:[...]}
  const extractLeads = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.leads)) return data.leads;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      leadsApi.list({ search })
        .then(res => { if (isActive) setLeads(extractLeads(res.data)); })
        .catch(e => console.log('Error loading leads', e))
        .finally(() => { if (isActive) setLoading(false); setRefreshing(false); });
      return () => { isActive = false; };
    }, [search])
  );

  const onRefresh = () => {
    setRefreshing(true);
    leadsApi.list({ search })
      .then(res => setLeads(extractLeads(res.data)))
      .catch(e => console.log('Error refreshing leads', e))
      .finally(() => setRefreshing(false));
  };

  const renderLead = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('LeadDetail', { leadId: item._id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.leadAvatarBox}>
          <Text style={styles.leadAvatarText}>{item.name?.substring(0, 1).toUpperCase() || 'L'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.leadName} numberOfLines={1}>{item.name}</Text>
          {item.company ? <Text style={styles.leadCompany} numberOfLines={1}>{item.company}</Text> : null}
        </View>
        <View style={[styles.badge, getStatusStyle(item.status)]}>
          <Text style={[styles.badgeText, getStatusTextStyle(item.status)]}>
            {item.status?.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="call-outline" size={14} color={Theme.colors.textSecondary} />
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
        {item.source ? (
          <View style={styles.detailItem}>
            <Ionicons name="megaphone-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={styles.detailText}>{item.source}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <Ionicons name="chevron-forward" size={16} color={Theme.colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search leads..."
          placeholderTextColor={Theme.colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={leads}
        keyExtractor={(item) => item._id}
        renderItem={renderLead}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="funnel-outline" size={56} color={Theme.colors.border} />
              <Text style={styles.emptyTitle}>No leads found</Text>
              <Text style={styles.emptyText}>Tap + to add your first lead</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('AddLead')}>
                <Text style={styles.emptyBtnText}>Add Lead</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddLead')}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const getStatusStyle = (status) => {
  switch (status) {
    case 'new': return { backgroundColor: '#DBEAFE' };
    case 'contacted': return { backgroundColor: '#FEF3C7' };
    case 'qualified': return { backgroundColor: '#D1FAE5' };
    case 'proposal': return { backgroundColor: '#EDE9FE' };
    case 'negotiation': return { backgroundColor: '#FFEDD5' };
    case 'won': return { backgroundColor: '#D1FAE5' };
    case 'lost': return { backgroundColor: '#FEE2E2' };
    default: return { backgroundColor: Theme.colors.border };
  }
};

const getStatusTextStyle = (status) => {
  switch (status) {
    case 'new': return { color: '#1E3A8A' };
    case 'contacted': return { color: '#92400E' };
    case 'qualified': return { color: '#065F46' };
    case 'proposal': return { color: '#5B21B6' };
    case 'negotiation': return { color: '#9A3412' };
    case 'won': return { color: '#059669' };
    case 'lost': return { color: '#991B1B' };
    default: return { color: Theme.colors.textSecondary };
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    margin: Theme.spacing.m,
    paddingHorizontal: Theme.spacing.m,
    borderRadius: Theme.borderRadius.m,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchIcon: { marginRight: Theme.spacing.s },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  listContent: { paddingHorizontal: Theme.spacing.m, paddingBottom: 100 },
  card: {
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.l,
    marginBottom: Theme.spacing.m,
    padding: Theme.spacing.m,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.s,
  },
  leadAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadAvatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  leadName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  leadCompany: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: Theme.spacing.s,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.round,
  },
  badgeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: Theme.typography.weights.bold,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
    paddingLeft: 50,
  },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  cardFooter: { alignItems: 'flex-end', marginTop: 4 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  emptyBtn: {
    marginTop: Theme.spacing.l,
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: Theme.spacing.xl,
    paddingVertical: Theme.spacing.m,
    borderRadius: Theme.borderRadius.round,
  },
  emptyBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});
