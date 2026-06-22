import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';

const BIKE_ICON = require('../../assets/bike_marker.png');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { locationsApi, attendanceApi } from '../../api';
import SocketService from '../../services/location/SocketService';
import { Theme } from '../../theme/Theme';

const STALE_MS = 12 * 60 * 1000;
const INDIA_REGION = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 25, longitudeDelta: 25 };

// Faint / muted map style (Uber-like) so the coloured bike markers stand out.
// Lightens geometry, softens labels, and hides POI/transit clutter.
const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b3b6bb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f3f4f6' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e6ece6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e9eaec' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#c2c5ca' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#eceef0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe6f0' }] },
];

const colorFor = (s) => (s === 'working' ? '#10B981' : s === 'done' ? '#3B82F6' : '#9CA3AF');

const agoText = (ms) => {
  if (!ms) return 'no recent update';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

// Marker: a top-down BIKE icon that rotates to the direction of travel (Uber
// style) for reps that are out and moving (status 'working'). For checked-out /
// stationary reps we show a simple coloured puck. The name chip stays upright.
function MarkerGraphic({ name, status, heading }) {
  const color = colorFor(status);
  const hasHeading = heading != null && !isNaN(heading);

  return (
    <View style={styles.pinWrap}>
      <View style={styles.nameChip}>
        <Text style={styles.nameChipText} numberOfLines={1}>{name}</Text>
      </View>
      {status === 'working' ? (
        <Image
          source={BIKE_ICON}
          style={[styles.bike, { transform: [{ rotate: `${hasHeading ? heading : 0}deg` }] }]}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.puck}>
          <View style={[styles.halo, { backgroundColor: color }]} />
          <View style={[styles.centerDot, { backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

export default function TeamMapScreen({ route }) {
  const insets = useSafeAreaInsets();
  const focus = route?.params?.focus || null;
  const [markers, setMarkers] = useState([]); // meta: {id,name,status,heading,area,ago}
  const [stats, setStats] = useState({ working: 0, done: 0, total: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const regionsRef = useRef({}); // id -> AnimatedRegion (smooth coordinate)
  const readyRef = useRef(false);

  const ensureRegion = (id, lat, lng) => {
    if (!regionsRef.current[id]) {
      regionsRef.current[id] = new AnimatedRegion({
        latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01,
      });
    }
    return regionsRef.current[id];
  };

  // Add or move a marker. Existing markers glide to the new coordinate.
  const upsertMarker = useCallback((p) => {
    if (!p || p.lat == null || p.lng == null) return;
    const existing = !!regionsRef.current[p.id];
    const region = ensureRegion(p.id, p.lat, p.lng);
    if (existing) {
      region.timing({ latitude: p.lat, longitude: p.lng, duration: 1500, useNativeDriver: false }).start();
    }
    setMarkers((prev) => {
      const idx = prev.findIndex((m) => m.id === p.id);
      const prevMeta = idx >= 0 ? prev[idx] : null;
      // Keep the last known heading when this fix has none (stationary), so the
      // bike keeps pointing the last travel direction instead of snapping north.
      const heading = (p.heading != null && !isNaN(p.heading)) ? p.heading : (prevMeta?.heading ?? null);
      const meta = { id: p.id, name: p.name, status: p.status, heading, area: p.area, ago: p.ago || 'just now' };
      if (idx === -1) return [...prev, meta];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...meta };
      return copy;
    });
  }, []);

  const fitTo = useCallback((pts) => {
    if (!mapRef.current) return;
    if (focus && focus.lat && focus.lng) {
      mapRef.current.animateToRegion({ latitude: focus.lat, longitude: focus.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      return;
    }
    const coords = pts.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (coords.length === 1) {
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
    } else if (coords.length > 1) {
      mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 90, right: 60, bottom: 120, left: 60 }, animated: true });
    }
  }, [focus]);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [locRes, attRes] = await Promise.all([locationsApi.list(), attendanceApi.byDate(today)]);

      const attMap = {};
      (attRes.data || []).forEach((a) => {
        const uid = String(a.userId?._id || a.userId);
        const punchedIn = a.punchIn && !a.punchOut;
        const checkedOut = a.punchIn && a.punchOut;
        attMap[uid] = punchedIn ? 'working' : checkedOut ? 'done' : 'absent';
      });

      const points = (locRes.data || [])
        .filter((l) => l.lat && l.lng)
        .map((l) => {
          const uid = String(l.userId?._id || l.userId);
          const status = attMap[uid] || 'absent';
          if (status === 'absent') return null;
          const lastSeenMs = l.lastSeen ? new Date(l.lastSeen).getTime() : 0;
          return {
            id: uid,
            name: l.name || l.userId?.name || 'Team member',
            lat: l.lat, lng: l.lng,
            area: l.area || '',
            heading: l.heading ?? null,
            status,
            ago: agoText(lastSeenMs),
          };
        })
        .filter(Boolean);

      setStats({
        working: points.filter((p) => p.status === 'working').length,
        done: points.filter((p) => p.status === 'done').length,
        total: points.length,
      });
      points.forEach(upsertMarker);
      if (readyRef.current) setTimeout(() => fitTo(points), 300);
    } catch (e) {
      console.log('Error loading team map', e);
    } finally {
      setLoading(false);
    }
  };

  // Live location doc → marker point (tracking only runs while punched in).
  const toPoint = (loc) => ({
    id: String(loc.userId?._id || loc.userId),
    name: loc.name || loc.userId?.name || 'Team member',
    lat: loc.lat, lng: loc.lng,
    area: loc.area || '',
    heading: loc.heading ?? null,
    status: loc.status === 'offline' ? 'done' : 'working',
    ago: 'just now',
  });

  useFocusEffect(useCallback(() => {
    setFilter('all');
    load();
    let unsub = null;
    (async () => {
      await SocketService.connect();
      unsub = SocketService.onLive((loc) => {
        const p = toPoint(loc);
        if (p.lat && p.lng) upsertMarker(p);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, []));

  const visible = filter === 'all' ? markers : markers.filter((m) => m.status === filter);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={MAP_STYLE}
        initialRegion={INDIA_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        toolbarEnabled={false}
        onMapReady={() => { readyRef.current = true; fitTo(markers); }}
      >
        {visible.map((m) => {
          const region = regionsRef.current[m.id];
          if (!region) return null;
          return (
            <Marker.Animated
              key={m.id}
              coordinate={region}
              anchor={{ x: 0.5, y: 0.5 }}
              title={m.name}
              description={`${m.status === 'working' ? 'Working' : m.status === 'done' ? 'Checked out' : 'Offline'}${m.area ? ' · ' + m.area : ''} · ${m.ago}`}
            >
              <MarkerGraphic name={m.name} status={m.status} heading={m.heading} />
            </Marker.Animated>
          );
        })}
      </MapView>

      {/* Legend + filter chips */}
      <View style={[styles.legend, { top: insets.top + 12 }]}>
        <TouchableOpacity style={[styles.filterChip, filter === 'all' && styles.filterChipActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All ({stats.total})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterChip, filter === 'working' && styles.filterChipActiveGreen]} onPress={() => setFilter('working')}>
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.filterText, filter === 'working' && styles.filterTextActive]}>Working ({stats.working})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterChip, filter === 'done' && styles.filterChipActiveBlue]} onPress={() => setFilter('done')}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={[styles.filterText, filter === 'done' && styles.filterTextActive]}>Done ({stats.done})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  pinWrap: { alignItems: 'center', justifyContent: 'flex-start' },
  nameChip: {
    marginBottom: 3, maxWidth: 120,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
  nameChipText: { fontSize: 10, fontWeight: '700', color: Theme.colors.text, fontFamily: Theme.typography.fontFamily },
  // Top-down bike marker (rotates to heading).
  bike: { width: 46, height: 46 },
  // Puck for stationary / checked-out reps (dot + halo).
  puck: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, opacity: 0.22 },
  centerDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#fff' },
  legend: {
    position: 'absolute', top: 12, left: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  filterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)',
  },
  filterChipActive: { backgroundColor: Theme.colors.primary },
  filterChipActiveGreen: { backgroundColor: '#10B981' },
  filterChipActiveBlue: { backgroundColor: '#3B82F6' },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.text, fontWeight: Theme.typography.weights.bold },
  filterTextActive: { color: '#fff' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
});
