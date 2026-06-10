import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, TextInput, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { usersApi, locationsApi, attendanceApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STALE_MS = 12 * 60 * 1000; // no location ping in 12 min => offline/stale
const todayStr = () => new Date().toISOString().split('T')[0];

export default function TeamMonitorScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | working | done | absent
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showPicker, setShowPicker] = useState(false);

  const isToday = selectedDate === todayStr();

  const onPickDate = (event, date) => {
    setShowPicker(false);
    if (!date || event?.type === 'dismissed') return;
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (date > end) return; // no future dates
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const ago = (ms) => {
    if (!ms) return 'no location yet';
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };
  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  const load = async () => {
    try {
      // Live location only applies to "today"; for past days we use the punch-in
      // location recorded that day (we don't keep a full location history).
      const reqs = [usersApi.list(), attendanceApi.byDate(selectedDate)];
      if (isToday) reqs.push(locationsApi.list());
      const [usersRes, attRes, locRes] = await Promise.allSettled(reqs);

      const users = usersRes.status === 'fulfilled' ? (usersRes.value.data || []) : [];

      const attMap = {};
      if (attRes.status === 'fulfilled') {
        (attRes.value.data || []).forEach((a) => { attMap[String(a.userId?._id || a.userId)] = a; });
      }
      const locMap = {};
      if (isToday && locRes?.status === 'fulfilled') {
        (locRes.value.data || []).forEach((l) => { locMap[String(l.userId?._id || l.userId)] = l; });
      }

      const merged = users.map((u) => {
        const uid = String(u._id);
        const att = attMap[uid];
        const punchedIn = att?.punchIn && !att?.punchOut;
        const checkedOut = att?.punchIn && att?.punchOut;
        const attendance = punchedIn ? 'working' : checkedOut ? 'done' : 'absent';

        let lat, lng, locLabel, online = false;
        if (isToday) {
          const loc = locMap[uid];
          lat = loc?.lat; lng = loc?.lng;
          const lastSeenMs = loc?.lastSeen ? new Date(loc.lastSeen).getTime() : 0;
          online = !!(lastSeenMs && Date.now() - lastSeenMs < STALE_MS);
          locLabel = loc ? `${loc.area ? loc.area + ' · ' : ''}${ago(lastSeenMs)}` : 'no location yet';
        } else {
          const pin = att?.punchIn;
          if (pin?.lat) {
            lat = pin.lat; lng = pin.lng;
            locLabel = `In ${fmtTime(pin.time)}${pin.address ? ' · ' + pin.address : ''}`;
          } else {
            locLabel = 'No punch-in';
          }
        }

        return { user: u, attendance, lat, lng, locLabel, online };
      });

      merged.sort((a, b) => {
        const rank = (x) => (x.attendance === 'working' ? 0 : x.attendance === 'done' ? 1 : 2);
        return rank(a) - rank(b) || (a.user.name || '').localeCompare(b.user.name || '');
      });

      setRows(merged);
    } catch (e) {
      console.log('Error loading team monitor', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-runs on focus AND whenever the selected date changes.
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [selectedDate]));

  const dateLabel = () => {
    if (isToday) return 'Today';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (selectedDate === y.toISOString().split('T')[0]) return 'Yesterday';
    return new Date(selectedDate + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const openLocation = (item) => {
    if (!item.lat || !item.lng) {
      Alert.alert('No location', `No location has been reported for ${item.user.name} yet.`);
      return;
    }
    // Open the in-app map (OpenStreetMap, no Google key) centered on this person.
    navigation.navigate('TeamMap', {
      focus: { lat: item.lat, lng: item.lng, name: item.user.name },
    });
  };

  const attChip = (a) => {
    if (a === 'working') return { label: 'Working', bg: '#DBEAFE', fg: '#1E3A8A' };
    if (a === 'done') return { label: 'Checked out', bg: '#D1FAE5', fg: '#065F46' };
    return { label: 'Absent', bg: '#FEE2E2', fg: '#991B1B' };
  };

  const renderItem = ({ item }) => {
    const u = item.user;
    const chip = attChip(item.attendance);
    return (
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(u.name || 'U').substring(0, 2).toUpperCase()}</Text>
          <View style={[styles.dot, { backgroundColor: item.online ? '#10B981' : '#9CA3AF' }]} />
        </View>

        <View style={styles.info}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
            </View>
          </View>
          <Text style={styles.role}>{u.role}</Text>
          <TouchableOpacity style={styles.locRow} onPress={() => openLocation(item)} activeOpacity={0.6}>
            <Ionicons name="location" size={13} color={item.lat ? Theme.colors.primary : Theme.colors.textSecondary} />
            <Text style={[styles.locText, item.lat && styles.locTextLink]} numberOfLines={1}>
              {item.locLabel}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.trackBtn} onPress={() => openLocation(item)}>
            <Ionicons name="navigate" size={18} color="#fff" />
          </TouchableOpacity>
          {u.phone ? (
            <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${u.phone}`)}>
              <Ionicons name="call" size={18} color={Theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'working', label: 'Working' },
    { key: 'done', label: 'Checked out' },
    { key: 'absent', label: 'Absent' },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.attendance !== statusFilter) return false;
      if (q && !(r.user.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Date picker button */}
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.calIconBtn} onPress={() => setShowPicker(true)}>
          <Ionicons name={isToday ? 'calendar-outline' : 'calendar'} size={22} color={Theme.colors.primary} />
          <Text style={styles.calLabel}>{isToday ? 'Today' : dateLabel()}</Text>
        </TouchableOpacity>
      </View>

      {/* Shows which day is being viewed when it's not today */}
      {!isToday && (
        <View style={styles.dateChip}>
          <Text style={styles.dateChipText}>Showing: {dateLabel()}</Text>
          <TouchableOpacity onPress={() => setSelectedDate(todayStr())}>
            <Text style={styles.dateChipReset}>Back to Today ✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {showPicker && (
        <DateTimePicker
          value={new Date(selectedDate + 'T00:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          maximumDate={new Date()}
          onChange={onPickDate}
        />
      )}

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search team member…"
          placeholderTextColor={Theme.colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = statusFilter === f.key;
          const count = f.key === 'all' ? rows.length : rows.filter((r) => r.attendance === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => String(item.user._id || i)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>
              {rows.length === 0 ? 'No team members to monitor.' : 'No members match your filter.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  calIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  calLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    marginHorizontal: 12,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dateChipText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  dateChipReset: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.primary,
    fontWeight: Theme.typography.weights.bold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.colors.white,
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  filterChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, fontWeight: Theme.typography.weights.bold },
  filterTextActive: { color: '#fff' },
  header: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    fontWeight: Theme.typography.weights.bold,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.l,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: Theme.typography.weights.bold, fontFamily: Theme.typography.fontFamily },
  dot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: '#fff',
  },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  role: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginLeft: 8 },
  chipText: { fontSize: 11, fontWeight: Theme.typography.weights.bold, fontFamily: Theme.typography.fontFamily },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  locText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary },
  locTextLink: { color: Theme.colors.primary, fontWeight: Theme.typography.weights.medium },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  trackBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  callBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1, borderColor: Theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
});
