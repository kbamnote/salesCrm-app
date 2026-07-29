import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { fulfillmentApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const OVERSIGHT = ['admin', 'manager', 'assistant_hr'];
const CAN_START_PIPELINE = ['admin', 'manager', 'assistant_hr'];

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
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [eligibleDeals, setEligibleDeals] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [startingPipeline, setStartingPipeline] = useState(null); // meetingId being started

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

  const openPipelineModal = async () => {
    setLoadingDeals(true);
    setShowPipelineModal(true);
    try {
      const res = await fulfillmentApi.eligibleDeals();
      setEligibleDeals(res.data || []);
    } catch (e) {
      console.log('Error loading eligible deals', e);
      setEligibleDeals([]);
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleStartPipeline = (deal) => {
    Alert.alert(
      'Start Pipeline',
      `Create fulfillment pipeline for ${deal.clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setStartingPipeline(deal._id);
            try {
              await fulfillmentApi.createFromMeeting(deal._id);
              Alert.alert('✅ Done', `Pipeline started for ${deal.clientName}`);
              setShowPipelineModal(false);
              setEligibleDeals([]);
              load(); // refresh the main list
            } catch (e) {
              const msg = e?.response?.data?.error || e?.message || 'Failed to start pipeline';
              Alert.alert('Error', msg);
            } finally {
              setStartingPipeline(null);
            }
          },
        },
      ]
    );
  };

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
    const canStart = CAN_START_PIPELINE.includes(user?.role);
    return (
      <>
      {canStart && (
        <TouchableOpacity style={styles.startBtn} onPress={openPipelineModal}>
          <View style={styles.startBtnIcon}>
            <Ionicons name="add-circle" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.startBtnTitle}>Start Pipeline</Text>
            <Text style={styles.startBtnSub}>Create a fulfillment order from a closed deal</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      )}
      {isOversight && stats ? (
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
      ) : null}
    </>);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  const fmtDealValue = (v) => {
    if (!v) return '';
    return '₹' + Number(v).toLocaleString('en-IN');
  };
  const fmtDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  return (
    <View style={{ flex: 1 }}>
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

    {/* Start Pipeline modal */}
    <Modal visible={showPipelineModal} transparent animationType="slide" onRequestClose={() => setShowPipelineModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Ionicons name="add-circle-outline" size={22} color={Theme.colors.primary} />
            <Text style={styles.modalTitle}>Start Pipeline</Text>
            <TouchableOpacity onPress={() => setShowPipelineModal(false)}>
              <Ionicons name="close" size={24} color={Theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loadingDeals ? (
            <View style={styles.modalCenter}>
              <ActivityIndicator size="large" color={Theme.colors.primary} />
              <Text style={styles.modalLoadingText}>Loading eligible deals...</Text>
            </View>
          ) : eligibleDeals.length === 0 ? (
            <View style={styles.modalCenter}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#10B981" />
              <Text style={styles.modalEmptyText}>All caught up!</Text>
              <Text style={styles.modalEmptySub}>Every closed deal already has a pipeline started.</Text>
            </View>
          ) : (
            <FlatList
              data={eligibleDeals}
              keyExtractor={(item) => item._id}
              style={styles.dealList}
              renderItem={({ item }) => {
                const busy = startingPipeline === item._id;
                return (
                  <TouchableOpacity
                    style={styles.dealRow}
                    onPress={() => handleStartPipeline(item)}
                    disabled={busy}
                  >
                    <View style={styles.dealInfo}>
                      <Text style={styles.dealName}>{item.clientName}</Text>
                      <View style={styles.dealMeta}>
                        {item.salesName && (
                          <View style={styles.dealMetaItem}>
                            <Ionicons name="person-outline" size={11} color={Theme.colors.textSecondary} />
                            <Text style={styles.dealMetaText}>{item.salesName}</Text>
                          </View>
                        )}
                        {item.date && (
                          <View style={styles.dealMetaItem}>
                            <Ionicons name="calendar-outline" size={11} color={Theme.colors.textSecondary} />
                            <Text style={styles.dealMetaText}>{fmtDate(item.date)}</Text>
                          </View>
                        )}
                        {item.dealValue ? (
                          <View style={styles.dealMetaItem}>
                            <Ionicons name="cash-outline" size={11} color={Theme.colors.textSecondary} />
                            <Text style={styles.dealMetaText}>{fmtDealValue(item.dealValue)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={Theme.colors.primary} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={24} color={Theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={null}
            />
          )}
        </View>
      </View>
    </Modal>
    </View>
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

  // Start Pipeline button
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Theme.colors.primary, borderRadius: 14,
    padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  startBtnIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnTitle: {
    fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '800', color: '#fff',
  },
  startBtnSub: {
    fontFamily: Theme.typography.fontFamily, fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 1,
  },

  // Start Pipeline modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 18, borderBottomWidth: 1, borderBottomColor: Theme.colors.border,
  },
  modalTitle: {
    flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.text,
  },
  modalCenter: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 30 },
  modalLoadingText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 12,
  },
  modalEmptyText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '700', color: Theme.colors.text, marginTop: 14,
  },
  modalEmptySub: {
    fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center',
  },
  dealList: { maxHeight: 500 },
  dealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 18,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  dealInfo: { flex: 1 },
  dealName: {
    fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text,
  },
  dealMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  dealMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dealMetaText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600',
  },
});
