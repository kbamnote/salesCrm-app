import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { fulfillmentApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const OVERSIGHT = ['admin', 'manager'];

export const STAGE_META = {
  data_collection: { title: 'Data Collection', icon: 'clipboard-outline' },
  social_media:    { title: 'Social Media',     icon: 'share-social-outline' },
  website:         { title: 'Website',          icon: 'globe-outline' },
  kit_check:       { title: 'Kit Check',        icon: 'cube-outline' },
  qc:              { title: 'QC Verification',  icon: 'qr-code-outline' },
  delivery:        { title: 'Delivery',         icon: 'car-outline' },
  feedback:        { title: 'Feedback',         icon: 'chatbox-ellipses-outline' },
  closed:          { title: 'Completed',        icon: 'checkmark-done-outline' },
};

const daysAgo = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const agoLabel = (d) => {
  const days = daysAgo(d);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

export default function FulfillmentListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isOversight = OVERSIGHT.includes(user?.role);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        fulfillmentApi.list(),
        isOversight ? fulfillmentApi.stats().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);
      setOrders(listRes.data || []);
      setStats(statsRes.data);
    } catch (e) {
      console.log('Error loading orders', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const renderItem = ({ item }) => {
    const done = item.status === 'completed';
    const meta = STAGE_META[item.currentStage] || STAGE_META.data_collection;
    const total = item.stages.filter((s) => s.status !== 'skipped').length;
    const completed = item.stages.filter((s) => s.status === 'completed').length;
    const stale = !done && daysAgo(item.updatedAt) >= 3;

    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('FulfillmentDetail', { id: item._id })}>
        <View style={styles.cardTop}>
          <Text style={styles.client} numberOfLines={1}>{item.clientName || 'Client'}</Text>
          <View style={[styles.badge, done ? styles.badgeDone : styles.badgeActive]}>
            <Text style={[styles.badgeText, done ? styles.badgeTextDone : styles.badgeTextActive]}>
              {done ? 'Completed' : meta.title}
            </Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${total ? (completed / total) * 100 : 0}%` }]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{completed}/{total} stages</Text>
          <Text style={[styles.metaText, stale && styles.metaStale]}>
            {stale ? <Ionicons name="alert-circle" size={12} color="#EF4444" /> : null} Updated {agoLabel(item.updatedAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (!isOversight || !stats) return null;
    return (
      <View style={styles.dash}>
        <View style={styles.statTiles}>
          <StatTile label="Total" value={stats.total} color={Theme.colors.text} />
          <StatTile label="Active" value={stats.inProgress} color="#2563EB" />
          <StatTile label="Done" value={stats.completed} color="#059669" />
          <StatTile label="Stalled" value={stats.stalled} color={stats.stalled ? '#DC2626' : Theme.colors.textSecondary} />
        </View>
        <View style={styles.stageCounts}>
          {Object.keys(STAGE_META).filter((k) => k !== 'closed').map((k) => (
            (stats.byStage?.[k] ? (
              <View key={k} style={styles.stageCountPill}>
                <Text style={styles.stageCountName}>{STAGE_META[k].title}</Text>
                <Text style={styles.stageCountNum}>{stats.byStage[k]}</Text>
              </View>
            ) : null)
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={(item) => item._id}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={48} color={Theme.colors.border} />
          <Text style={styles.emptyText}>No orders in your queue</Text>
          <Text style={styles.emptySub}>Closed deals appear here as they reach your stage.</Text>
        </View>
      }
    />
  );
}

function StatTile({ label, value, color }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  dash: { marginBottom: 6 },
  statTiles: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statTile: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  statValue: { fontFamily: Theme.typography.fontFamily, fontSize: 22, fontWeight: '800' },
  statLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2 },
  stageCounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  stageCountPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: Theme.colors.border },
  stageCountName: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '600' },
  stageCountNum: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.primary, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  client: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeActive: { backgroundColor: Theme.colors.primary + '18' },
  badgeDone: { backgroundColor: '#D1FAE5' },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '800' },
  badgeTextActive: { color: Theme.colors.primary },
  badgeTextDone: { color: '#065F46' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F5', marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Theme.colors.primary },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metaText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '600' },
  metaStale: { color: '#EF4444' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12, fontWeight: '700' },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
});
