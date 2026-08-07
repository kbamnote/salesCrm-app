import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking,
  ActivityIndicator, RefreshControl, Modal, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { callAppointmentsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { photoUri, initialsOf } from '../../utils/avatar';
import { Theme } from '../../theme/Theme';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/**
 * The call funnel. One screen, two audiences:
 *   HR / admin      → every appointment, with an Assign action on pending ones
 *   sales-type user → the appointments assigned to them (and, for calling roles,
 *                     the ones they booked themselves)
 */
export default function CallFunnelScreen() {
  const { user } = useAuth();
  const canAssign = ['hr', 'admin'].includes(user?.role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');   // all | pending_hr | assigned

  const [assignFor, setAssignFor] = useState(null);
  const [salesUsers, setSalesUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await callAppointmentsApi.list();
      setItems(res.data || []);
    } catch (e) {
      console.log('Error loading call funnel', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openAssign = (item) => {
    setAssignFor(item);
    if (salesUsers.length === 0) {
      setUsersLoading(true);
      callAppointmentsApi.salesUsers()
        .then((r) => setSalesUsers(r.data || []))
        .catch(() => {})
        .finally(() => setUsersLoading(false));
    }
  };

  const assignTo = async (u) => {
    setBusy(true);
    try {
      const res = await callAppointmentsApi.assign(assignFor._id, u._id);
      setItems((prev) => prev.map((x) => (x._id === res.data._id ? res.data : x)));
      setAssignFor(null);
      Alert.alert('Assigned', `Sent to ${u.name}.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not assign.');
    } finally {
      setBusy(false);
    }
  };

  const visible = items.filter((i) => filter === 'all' || i.status === filter);
  const pendingCount = items.filter((i) => i.status === 'pending_hr').length;

  const openMap = (url) => { if (url) Linking.openURL(url).catch(() => {}); };
  const callNow = (phone) => { if (phone) Linking.openURL(`tel:${phone}`).catch(() => {}); };

  const renderItem = ({ item }) => {
    const pending = item.status === 'pending_hr';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.company} numberOfLines={1}>
              {item.companyName || item.ownerName || item.mobile}
            </Text>
            {!!item.ownerName && <Text style={styles.owner} numberOfLines={1}>{item.ownerName}</Text>}
          </View>
          <View style={[styles.badge, pending ? styles.badgePending : styles.badgeAssigned]}>
            <Text style={[styles.badgeText, { color: pending ? '#92400E' : '#065F46' }]}>
              {pending ? 'Awaiting HR' : 'Assigned'}
            </Text>
          </View>
        </View>

        <Row icon="person-outline" label="Lead source" value={item.leadSource} />
        <Row icon="call-outline" label="Mobile" value={item.mobile} onPress={() => callNow(item.mobile)} link />
        {!!(item.date || item.time) && (
          <Row icon="calendar-outline" label="When" value={`${fmtDate(item.date)}${item.time ? ' · ' + item.time : ''}`} />
        )}
        {!!item.address && <Row icon="location-outline" label="Address" value={item.address} />}
        {!!item.mapLink && <Row icon="map-outline" label="Map" value="Open in Maps" onPress={() => openMap(item.mapLink)} link />}
        {!!item.note && <Row icon="information-circle-outline" label="Note" value={item.note} />}
        {!pending && <Row icon="briefcase-outline" label="Assigned to" value={item.assignedToName} />}

        {canAssign && (
          <TouchableOpacity style={[styles.assignBtn, !pending && styles.reassignBtn]} onPress={() => openAssign(item)}>
            <Ionicons name={pending ? 'send-outline' : 'swap-horizontal-outline'} size={16} color={pending ? '#fff' : Theme.colors.primary} />
            <Text style={[styles.assignText, !pending && { color: Theme.colors.primary }]}>
              {pending ? 'Assign to sales' : 'Reassign'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {canAssign && (
        <View style={styles.filterBar}>
          {[
            { k: 'all', label: `All (${items.length})` },
            { k: 'pending_hr', label: `Awaiting HR (${pendingCount})` },
            { k: 'assigned', label: 'Assigned' },
          ].map((f) => (
            <TouchableOpacity key={f.k} style={[styles.chip, filter === f.k && styles.chipOn]} onPress={() => setFilter(f.k)}>
              <Text style={[styles.chipText, filter === f.k && styles.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(i) => String(i._id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="funnel-outline" size={52} color={Theme.colors.border} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              {canAssign
                ? 'Appointments fixed by the calling team will appear here for you to assign.'
                : 'Appointments assigned to you will appear here.'}
            </Text>
          </View>
        }
      />

      {/* Assign picker */}
      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => !busy && setAssignFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Assign to sales</Text>
              <TouchableOpacity onPress={() => !busy && setAssignFor(null)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            {usersLoading ? (
              <ActivityIndicator color={Theme.colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={salesUsers}
                keyExtractor={(u) => String(u._id)}
                style={{ maxHeight: 380 }}
                ListEmptyComponent={<Text style={styles.emptyText}>No sales users found.</Text>}
                renderItem={({ item: u }) => (
                  <TouchableOpacity style={styles.userRow} onPress={() => assignTo(u)} disabled={busy}>
                    <View style={styles.avatar}>
                      {photoUri(u.avatar)
                        ? <Image source={{ uri: photoUri(u.avatar) }} style={styles.avatarImg} />
                        : <Text style={styles.avatarText}>{initialsOf(u.name)}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userRole}>{u.role}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ icon, label, value, onPress, link }) {
  if (!value) return null;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
      <Ionicons name={icon} size={15} color={Theme.colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, link && { color: Theme.colors.primary }]} numberOfLines={2}>{value}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  filterBar: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  chipOn: { borderColor: Theme.colors.primary, backgroundColor: Theme.colors.primary + '12' },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary },
  chipTextOn: { color: Theme.colors.primary },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  company: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  owner: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeAssigned: { backgroundColor: '#D1FAE5' },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  rowLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, width: 92 },
  rowValue: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },

  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Theme.colors.primary, borderRadius: 10, paddingVertical: 11, marginTop: 12 },
  reassignBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: Theme.colors.primary },
  assignText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.textSecondary, marginTop: 12 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 26 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.text },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Theme.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 38, height: 38, borderRadius: 19 },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: '#fff' },
  userName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  userRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize' },
});
