import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, FlatList, Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi, locationsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const INDIA = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 25, longitudeDelta: 25 };
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

// Total path distance in km (haversine over the points).
function routeKm(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const R = 6371000;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const la1 = (a.latitude * Math.PI) / 180, la2 = (b.latitude * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(h));
  }
  return (m / 1000).toFixed(1);
}

export default function RouteHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    usersApi.contacts().then((r) => setUsers(r.data || [])).catch(() => {});
  }, []);

  const fit = (pts) => {
    if (!mapRef.current || pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    } else {
      mapRef.current.fitToCoordinates(pts, { edgePadding: { top: 80, right: 60, bottom: 100, left: 60 }, animated: true });
    }
  };

  const loadRoute = useCallback(async (user, day) => {
    if (!user) return;
    setLoading(true);
    setPoints([]);
    try {
      const from = new Date(day); from.setHours(0, 0, 0, 0);
      const to = new Date(day); to.setHours(23, 59, 59, 999);
      const r = await locationsApi.history(user._id, { from: from.toISOString(), to: to.toISOString() });
      const pts = (r.data || [])
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ latitude: p.lat, longitude: p.lng, ts: p.ts }));
      setPoints(pts);
      setTimeout(() => fit(pts), 400);
    } catch (e) {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const pickUser = (u) => { setSelected(u); setPickerOpen(false); loadRoute(u, date); };
  const onDate = (e, d) => {
    setShowDate(false);
    if (e?.type !== 'dismissed' && d) { setDate(d); if (selected) loadRoute(selected, d); }
  };

  const startPt = points[0];
  const endPt = points[points.length - 1];

  return (
    <View style={styles.container}>
      {/* Filters: member + date */}
      <View style={styles.bar}>
        <TouchableOpacity style={styles.select} onPress={() => setPickerOpen(true)}>
          <Ionicons name="person-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.selectText} numberOfLines={1}>{selected?.name || 'Select member'}</Text>
          <Ionicons name="chevron-down" size={15} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.select} onPress={() => setShowDate(true)}>
          <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.selectText}>{fmtDate(date)}</Text>
        </TouchableOpacity>
      </View>
      {showDate && (
        <DateTimePicker value={date} mode="date" maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={onDate} />
      )}

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={INDIA}>
          {points.length > 1 && (
            <Polyline coordinates={points} strokeColor={Theme.colors.primary} strokeWidth={4} />
          )}
          {startPt && <Marker coordinate={startPt} title="Start" description={fmtTime(startPt.ts)} pinColor="#10B981" />}
          {endPt && points.length > 1 && <Marker coordinate={endPt} title="End" description={fmtTime(endPt.ts)} pinColor="#EF4444" />}
        </MapView>

        {loading && (
          <View style={styles.overlay}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>
        )}
        {!loading && !selected && (
          <View style={styles.empty}><Text style={styles.emptyText}>Select a team member and date to view their route.</Text></View>
        )}
        {!loading && selected && points.length === 0 && (
          <View style={styles.empty}><Text style={styles.emptyText}>No route recorded for {selected.name} on {fmtDate(date)}.</Text></View>
        )}
      </View>

      {/* Summary */}
      {points.length > 0 && (
        <View style={[styles.summary, { paddingBottom: 12 + 60 + insets.bottom }]}>
          <View style={styles.sumItem}><Text style={styles.sumVal}>{routeKm(points)} km</Text><Text style={styles.sumLbl}>Distance</Text></View>
          <View style={styles.sumDiv} />
          <View style={styles.sumItem}><Text style={styles.sumVal}>{fmtTime(startPt.ts)}</Text><Text style={styles.sumLbl}>Start</Text></View>
          <View style={styles.sumDiv} />
          <View style={styles.sumItem}><Text style={styles.sumVal}>{fmtTime(endPt.ts)}</Text><Text style={styles.sumLbl}>Last seen</Text></View>
        </View>
      )}

      {/* Member picker */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Member</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={users}
              keyExtractor={(u) => String(u._id)}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => pickUser(item)}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || 'U').substring(0, 2).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowRole}>{item.role}</Text>
                  </View>
                  {selected?._id === item._id && <Ionicons name="checkmark" size={20} color={Theme.colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  bar: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  select: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F7FA', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.4)' },
  empty: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  summary: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Theme.colors.border,
  },
  sumItem: { flex: 1, alignItems: 'center' },
  sumVal: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  sumLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 2 },
  sumDiv: { width: 1, height: 28, backgroundColor: Theme.colors.border },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  rowName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  rowRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 70 },
});
