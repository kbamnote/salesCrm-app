import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { locationsApi, attendanceApi, usersApi } from '../../api';
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

// Fan out markers that share (almost) the same spot so each rep is visible.
// Groups by an ~11 m grid; members of a group are placed evenly on a small ring
// (~18 m) around the shared point. Returns id -> { lat, lng } display position.
function spreadPositions(markers) {
  const groups = {};
  markers.forEach((m) => {
    if (m.lat == null || m.lng == null) return;
    const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
    (groups[key] = groups[key] || []).push(m);
  });
  const out = {};
  const R = 0.00016; // ~18 m
  Object.values(groups).forEach((g) => {
    if (g.length === 1) {
      out[g[0].id] = { lat: g[0].lat, lng: g[0].lng };
      return;
    }
    g.forEach((m, i) => {
      const ang = (2 * Math.PI * i) / g.length;
      out[m.id] = { lat: m.lat + R * Math.sin(ang), lng: m.lng + R * Math.cos(ang) };
    });
  });
  return out;
}

const agoText = (ms) => {
  if (!ms) return 'no recent update';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

const isPhoto = (a) => typeof a === 'string' && /^(https?:|data:image)/.test(a);

// One rep marker = the rep's PROFILE PHOTO in a coloured status ring, with the
// name chip above and a pointer marking the exact spot.
//
// Robust Android rendering:
//  - Initials always render synchronously, so the marker is NEVER blank even if
//    the photo is slow/fails (the photo overlays on top once loaded).
//  - tracksViewChanges starts true and turns false only AFTER the photo paints
//    (Image onLoad) — or shortly after mount for initials-only. This captures
//    the marker bitmap exactly once, after content is painted: no race, no blank,
//    no clipping. Native position animation still works with it off.
function RepMarker({ region, name, status, avatar, area, ago }) {
  const color = colorFor(status);
  const photo = isPhoto(avatar);
  const desc = `${status === 'working' ? 'Working' : status === 'done' ? 'Checked out' : 'Offline'}`
    + `${area ? ' · ' + area : ''} · ${ago}`;

  // Track view changes only briefly: long enough to capture the loaded photo,
  // then FREEZE the bitmap so it can't flicker (always-on re-rasterising made the
  // photo blink in/out). Initials render underneath so the marker is never blank.
  const [tracks, setTracks] = useState(true);
  const settle = useRef(null);
  useEffect(() => {
    setTracks(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setTracks(false), photo ? 1500 : 700);
    return () => clearTimeout(settle.current);
  }, [photo, status, name, avatar]);

  const onPhotoLoaded = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setTracks(false), 400); // capture then freeze
  };

  return (
    <Marker.Animated
      coordinate={region}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      title={name}
      description={desc}
    >
      {/* Transparent pad around the circle so its edges aren't at the bitmap
          boundary (Android trims a pixel or two there). Uniform square = no clip. */}
      <View style={styles.markerPad}>
        <View style={[styles.avatarRing, { borderColor: color }]}>
          <View style={[styles.avatarFallback, { backgroundColor: color }]}>
            <Text style={styles.avatarInit}>{initialsOf(name)}</Text>
          </View>
          {photo && (
            <Image
              source={{ uri: avatar }}
              style={styles.avatarImgAbs}
              fadeDuration={0}
              onLoad={onPhotoLoaded}
            />
          )}
        </View>
      </View>
    </Marker.Animated>
  );
}

export default function TeamMapScreen({ route }) {
  const insets = useSafeAreaInsets();
  const focus = route?.params?.focus || null;
  const [markers, setMarkers] = useState([]); // meta: {id,name,status,heading,area,ago}
  const [stats, setStats] = useState({ working: 0, done: 0, total: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState('standard'); // 'standard' | 'hybrid'
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef(null);
  const regionsRef = useRef({}); // id -> AnimatedRegion (smooth coordinate)
  const readyRef = useRef(false);
  const pointsRef = useRef([]);  // latest points (for fitting once map is ready)
  const fittedRef = useRef(false); // have we auto-zoomed to the team yet?
  const avatarRef = useRef({});  // userId -> avatar (photo url or initials)

  const ensureRegion = (id, lat, lng) => {
    if (!regionsRef.current[id]) {
      regionsRef.current[id] = new AnimatedRegion({
        latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01,
      });
    }
    return regionsRef.current[id];
  };

  // Add or update a marker. Stores the real lat/lng; the spread effect below
  // animates each region to its (possibly fanned-out) display position.
  const upsertMarker = useCallback((p) => {
    if (!p || p.lat == null || p.lng == null) return;
    ensureRegion(p.id, p.lat, p.lng);
    setMarkers((prev) => {
      const idx = prev.findIndex((m) => m.id === p.id);
      const prevMeta = idx >= 0 ? prev[idx] : null;
      const meta = {
        id: p.id, name: p.name, status: p.status, area: p.area,
        avatar: p.avatar ?? prevMeta?.avatar, // keep known avatar if a fix omits it
        ago: p.ago || 'just now',
        lat: p.lat, lng: p.lng,
      };
      if (idx === -1) return [...prev, meta];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...meta };
      return copy;
    });
  }, []);

  // Whenever positions change, fan out any overlapping markers and glide each
  // region to its display position (so reps at the same spot don't hide each other).
  useEffect(() => {
    const disp = spreadPositions(markers);
    markers.forEach((m) => {
      const region = regionsRef.current[m.id];
      const d = disp[m.id];
      if (region && d) {
        region.timing({ latitude: d.lat, longitude: d.lng, duration: 600, useNativeDriver: false }).start();
      }
    });
  }, [markers]);

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

  // Auto-zoom to the team once, as soon as BOTH the map is ready AND we have
  // points — handles either order (map ready first, or data first). Without this
  // the map can stay on the full-India initial region.
  const tryFit = useCallback(() => {
    if (readyRef.current && !fittedRef.current && pointsRef.current.length) {
      fitTo(pointsRef.current);
      fittedRef.current = true;
    }
  }, [fitTo]);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [locRes, attRes, usersRes] = await Promise.all([
        locationsApi.list(),
        attendanceApi.byDate(today),
        usersApi.contacts(),
      ]);

      // Build userId -> avatar map (used for both snapshot and live updates).
      (usersRes.data || []).forEach((u) => { avatarRef.current[String(u._id)] = u.avatar; });

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
            avatar: avatarRef.current[uid] || l.userId?.avatar,
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
      pointsRef.current = points;
      setTimeout(tryFit, 300); // fit now if map's already ready; else onMapReady will
    } catch (e) {
      console.log('Error loading team map', e);
    } finally {
      setLoading(false);
    }
  };

  // Manual refresh — re-fetch the snapshot and re-zoom to the team.
  const onRefresh = async () => {
    setRefreshing(true);
    fittedRef.current = false;
    try { await load(); } finally { setRefreshing(false); }
  };

  // Live location doc → marker point (tracking only runs while punched in).
  const toPoint = (loc) => {
    const id = String(loc.userId?._id || loc.userId);
    return {
      id,
      name: loc.name || loc.userId?.name || 'Team member',
      lat: loc.lat, lng: loc.lng,
      area: loc.area || '',
      avatar: avatarRef.current[id],
      status: loc.status === 'offline' ? 'done' : 'working',
      ago: 'just now',
    };
  };

  useFocusEffect(useCallback(() => {
    setFilter('all');
    fittedRef.current = false; // re-zoom to the team each time the screen opens
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
        mapType={mapType}
        customMapStyle={MAP_STYLE}
        initialRegion={INDIA_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        toolbarEnabled={false}
        onMapReady={() => { readyRef.current = true; tryFit(); }}
      >
        {visible.map((m) => {
          const region = regionsRef.current[m.id];
          if (!region) return null;
          return (
            <RepMarker
              key={m.id}
              region={region}
              name={m.name}
              status={m.status}
              avatar={m.avatar}
              area={m.area}
              ago={m.ago}
            />
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

      {/* Map controls: satellite toggle + manual refresh */}
      <View style={[styles.controls, { top: insets.top + 80 }]}>
        <TouchableOpacity
          style={[styles.ctrlBtn, mapType === 'hybrid' && styles.ctrlBtnActive]}
          onPress={() => setMapType((t) => (t === 'standard' ? 'hybrid' : 'standard'))}
        >
          <Ionicons name={mapType === 'standard' ? 'earth' : 'map'} size={20} color={mapType === 'hybrid' ? '#fff' : Theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? <ActivityIndicator size="small" color={Theme.colors.primary} /> : <Ionicons name="refresh" size={20} color={Theme.colors.primary} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  // Fixed-size root so Android measures one clean rectangle (prevents the
  // bottom of the marker getting clipped). Content sits at the bottom; the
  // pointer tip aligns to the coordinate via anchor {0.5, 1}.
  pinWrap: { width: 170, height: 124, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  nameChip: {
    marginBottom: 3, maxWidth: 120,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
  nameChipText: { fontSize: 10, fontWeight: '700', color: Theme.colors.text, fontFamily: Theme.typography.fontFamily },
  // Profile-photo marker: photo/initials inside a coloured status ring + pointer.
  // Transparent padding so the circle's edges sit away from the bitmap boundary.
  markerPad: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  // No elevation/shadow — Android renders shadows on circular marker views as a
  // clipped box, which looked like the bottom being "cut".
  avatarRing: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 2.5,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  // Photo overlays the initials (absolute), so the marker shows initials until
  // the photo loads and is never blank.
  avatarImgAbs: { position: 'absolute', width: 35, height: 35, borderRadius: 17.5 },
  avatarFallback: { width: 35, height: 35, borderRadius: 17.5, alignItems: 'center', justifyContent: 'center' },
  avatarInit: { color: '#fff', fontSize: 14, fontWeight: '800', fontFamily: Theme.typography.fontFamily },
  // Small downward pointer marking the exact spot (sits at the bottom = anchor).
  avatarPointer: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
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
  controls: { position: 'absolute', right: 12, alignItems: 'center', gap: 10 },
  ctrlBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  ctrlBtnActive: { backgroundColor: Theme.colors.primary },
});
