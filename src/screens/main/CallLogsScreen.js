import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking,
  ActivityIndicator, RefreshControl, Alert, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { callsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

// Only these two see everyone's calls and the download button; every other
// role that reaches this screen sees their own dialled numbers.
const OVERSIGHT_ROLES = ['admin', 'hr'];

const OUTCOMES = {
  interested:        { label: 'Interested',        color: '#10B981' },
  not_interested:    { label: 'Not Interested',    color: '#EF4444' },
  meeting_fixed:     { label: 'Meeting Fixed',     color: '#10B981' },
  callback:          { label: 'Callback',          color: '#6366F1' },
  no_answer:         { label: 'No Answer',         color: '#6B7280' },
  unreachable:       { label: 'Unreachable',       color: '#6B7280' },
  line_busy:         { label: 'Line Busy',         color: '#F59E0B' },
  appointment_fixed: { label: 'Appointment Fixed', color: '#10B981' },
  call_not_placed:   { label: 'Call not placed',   color: '#9CA3AF' },
  other:             { label: 'Other',             color: '#6366F1' },
  eod_call:          { label: 'EOD Call',          color: '#0EA5E9' },
};

// Quick filters across the top of the log. 'all' clears the outcome filter.
const OUTCOME_FILTERS = [
  { key: 'all',               label: 'All' },
  { key: 'appointment_fixed', label: 'Appointments' },
  { key: 'eod_call',          label: 'EOD Call' },
  { key: 'not_interested',    label: 'Not Interested' },
  { key: 'unreachable',       label: 'Unreachable' },
  { key: 'line_busy',         label: 'Line Busy' },
  { key: 'call_not_placed',   label: 'Not placed' },
  { key: 'other',             label: 'Other' },
];

const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const pretty = (d) =>
  new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export default function CallLogsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isOversight = OVERSIGHT_ROLES.includes(user?.role);

  const [calls, setCalls] = useState([]);
  const [summary, setSummary] = useState({ total: 0, connected: 0, appointments: 0, eod: 0 });
  const [outcome, setOutcome] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Default range = today.
  const [from, setFrom] = useState(new Date());
  const [to, setTo] = useState(new Date());
  const [picking, setPicking] = useState(null);   // 'from' | 'to' | null

  // Caller filter (oversight only).
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');       // '' = everyone
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await callsApi.log({
        from: ymd(from),
        to: ymd(to),
        userId: userId || undefined,
        outcome: outcome === 'all' ? undefined : outcome,
      });
      setCalls(res.data?.calls || []);
      setSummary(res.data?.summary || { total: 0, connected: 0, appointments: 0, eod: 0 });
    } catch (e) {
      console.log('Call log load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, to, userId, outcome]);

  useFocusEffect(useCallback(() => {
    load();
    if (isOversight && users.length === 0) {
      callsApi.logUsers().then((r) => setUsers(r.data || [])).catch(() => {});
    }
    return undefined;
  }, [load, isOversight, users.length]));

  const onPickDate = (e, d) => {
    const which = picking;
    setPicking(null);
    if (e?.type === 'dismissed' || !d) return;
    if (which === 'from') {
      setFrom(d);
      if (d > to) setTo(d);          // keep the range valid
    } else if (which === 'to') {
      setTo(d < from ? from : d);
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      // Export honours the on-screen outcome filter, so what you download
      // matches what you're looking at.
      const res = await callsApi.logExport({
        from: ymd(from),
        to: ymd(to),
        userId: userId || undefined,
        outcome: outcome === 'all' ? undefined : outcome,
      });
      const { filename, base64 } = res.data;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Call Report',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        Alert.alert('Saved', `Report saved as ${filename}.`);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not generate the report.');
    } finally {
      setExporting(false);
    }
  };

  const selectedUserName = userId
    ? (users.find((u) => String(u._id) === String(userId))?.name || 'User')
    : 'All callers';

  const renderCall = ({ item }) => {
    const meta = OUTCOMES[item.outcome] || { label: item.outcome || '—', color: '#6B7280' };
    const at = new Date(item.createdAt || item.date);
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)} activeOpacity={0.7}>
            <Text style={styles.number}>{item.phone || '—'}</Text>
          </TouchableOpacity>
          {!!item.clientName && item.clientName !== item.phone && (
            <Text style={styles.client} numberOfLines={1}>{item.clientName}</Text>
          )}
          <Text style={styles.meta}>
            {item.tmsName || 'Unknown'} · {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {!!item.reason && <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>}
        </View>
        <View style={[styles.pill, { backgroundColor: meta.color + '18', borderColor: meta.color + '55' }]}>
          <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking('from')}>
            <Ionicons name="calendar-outline" size={15} color={Theme.colors.primary} />
            <Text style={styles.dateText}>{pretty(from)}</Text>
          </TouchableOpacity>
          <Text style={styles.dash}>to</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking('to')}>
            <Ionicons name="calendar-outline" size={15} color={Theme.colors.primary} />
            <Text style={styles.dateText}>{pretty(to)}</Text>
          </TouchableOpacity>
        </View>

        {isOversight && (
          <View style={styles.oversightRow}>
            <TouchableOpacity style={styles.userBtn} onPress={() => setUserPickerOpen(true)}>
              <Ionicons name="person-outline" size={15} color={Theme.colors.primary} />
              <Text style={styles.dateText} numberOfLines={1}>{selectedUserName}</Text>
              <Ionicons name="chevron-down" size={15} color={Theme.colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.downloadBtn, exporting && { opacity: 0.6 }]}
              onPress={download}
              disabled={exporting}
            >
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="download-outline" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Summary */}
      {/* Outcome quick-filters */}
      <View style={styles.chipWrap}>
        <FlatList
          data={OUTCOME_FILTERS}
          keyExtractor={(o) => o.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: o }) => {
            const on = outcome === o.key;
            return (
              <TouchableOpacity
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setOutcome(o.key)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={styles.stats}>
        <Stat label="Dialled" value={summary.total} />
        <Stat label="Connected" value={summary.connected} color="#10B981" />
        <Stat label="Appointments" value={summary.appointments} color="#6366F1" />
        <Stat label="EOD" value={summary.eod || 0} color="#0EA5E9" />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => String(c._id)}
          renderItem={renderCall}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={Theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="call-outline" size={52} color={Theme.colors.border} />
              <Text style={styles.emptyTitle}>No calls in this period</Text>
            </View>
          }
        />
      )}

      {picking && (
        <DateTimePicker
          value={picking === 'from' ? from : to}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPickDate}
        />
      )}

      {/* Caller picker */}
      <Modal
        visible={userPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setUserPickerOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Show calls of</Text>
              <TouchableOpacity onPress={() => setUserPickerOpen(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ _id: '', name: 'All callers' }, ...users]}
              keyExtractor={(u) => String(u._id || 'all')}
              style={{ maxHeight: 360 }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => {
                const on = String(item._id) === String(userId);
                return (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => { setUserId(String(item._id)); setUserPickerOpen(false); }}
                  >
                    <Text style={[styles.userName, on && { color: Theme.colors.primary, fontWeight: '800' }]}>
                      {item.name}
                    </Text>
                    {!!item.role && <Text style={styles.userRole}>{item.role}</Text>}
                    {on && <Ionicons name="checkmark-circle" size={20} color={Theme.colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  filters: {
    paddingHorizontal: Theme.spacing.m,
    paddingTop: Theme.spacing.m,
    paddingBottom: Theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  dash: {
    marginHorizontal: 8,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
  dateText: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  oversightRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  userBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  downloadBtn: {
    width: 42,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.primary,
  },
  chipWrap: { borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  chipRow: { paddingHorizontal: Theme.spacing.m, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  chipOn: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  chipText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  chipTextOn: { color: '#fff' },
  stats: {
    flexDirection: 'row',
    paddingVertical: Theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  statLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.m,
    paddingVertical: Theme.spacing.m,
  },
  number: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: '700',
    color: Theme.colors.primary,
    letterSpacing: 0.4,
  },
  client: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.text,
    marginTop: 1,
  },
  meta: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  reason: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontStyle: 'italic',
    color: Theme.colors.textSecondary,
    marginTop: 3,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 10,
  },
  pillText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: Theme.spacing.m },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: 10,
  },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 26,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  userName: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  userRole: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
});
