import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ClientsScreen({ navigation }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Normalize different API response shapes: array, {clients:[...]}, {data:[...]}
  const extractClients = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.clients)) return data.clients;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      clientsApi.list({ search })
        .then(res => { if (isActive) setClients(extractClients(res.data)); })
        .catch(e => console.log('Error loading clients', e))
        .finally(() => { if (isActive) setLoading(false); setRefreshing(false); });
      return () => { isActive = false; };
    }, [search])
  );

  const onRefresh = () => {
    setRefreshing(true);
    clientsApi.list({ search })
      .then(res => setClients(extractClients(res.data)))
      .catch(e => console.log('Error refreshing clients', e))
      .finally(() => setRefreshing(false));
  };

  const renderClient = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ClientDetail', { clientId: item._id })}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.clientAvatarBox, { backgroundColor: getStatusColor(item.status) + '25' }]}>
          <Text style={[styles.clientAvatarText, { color: getStatusColor(item.status) }]}>
            {item.name?.substring(0, 1).toUpperCase() || 'C'}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.clientName} numberOfLines={1}>{item.name}</Text>
          {item.email ? <Text style={styles.clientEmail} numberOfLines={1}>{item.email}</Text> : null}
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
        {(item.city || item.area) ? (
          <View style={styles.detailItem}>
            <Ionicons name="location-outline" size={14} color={Theme.colors.textSecondary} />
            <Text style={styles.detailText}>{item.city || item.area}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        {item.tapifyProfileCreated && (
          <View style={styles.tapifyBadge}>
            <Ionicons name="card" size={12} color="#10B981" />
            <Text style={styles.tapifyText}>Tapify</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={Theme.colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Ionicons name="menu-outline" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clients</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddClient')} style={styles.menuBtn}>
          <Ionicons name="add" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
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
        data={clients}
        keyExtractor={(item) => item._id}
        renderItem={renderClient}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={56} color={Theme.colors.border} />
              <Text style={styles.emptyTitle}>No clients found</Text>
              <Text style={styles.emptyText}>Tap + to add your first client</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('AddClient')}>
                <Text style={styles.emptyBtnText}>Add Client</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return '#10B981';
    case 'prospect': return '#3B82F6';
    case 'inactive': return '#9CA3AF';
    case 'closed': return '#EF4444';
    default: return '#9CA3AF';
  }
};

const getStatusStyle = (status) => {
  switch (status) {
    case 'active': return { backgroundColor: '#D1FAE5' };
    case 'prospect': return { backgroundColor: '#DBEAFE' };
    case 'closed': return { backgroundColor: '#FEE2E2' };
    case 'inactive': return { backgroundColor: '#F3F4F6' };
    default: return { backgroundColor: Theme.colors.border };
  }
};

const getStatusTextStyle = (status) => {
  switch (status) {
    case 'active': return { color: '#065F46' };
    case 'prospect': return { color: '#1E3A8A' };
    case 'closed': return { color: '#991B1B' };
    case 'inactive': return { color: '#374151' };
    default: return { color: Theme.colors.textSecondary };
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  header: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Theme.typography.fontFamily,
  },
  menuBtn: {
    width: 40,
    alignItems: 'center',
  },
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
  clientAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
  },
  clientName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  clientEmail: {
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
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 8,
  },
  tapifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  tapifyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: '#10B981',
    fontWeight: Theme.typography.weights.bold,
  },
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
    bottom: 130,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
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
