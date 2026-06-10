import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { locationsApi, attendanceApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STALE_MS = 12 * 60 * 1000;

const agoText = (ms) => {
  if (!ms) return 'no recent update';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

function buildHtml(points, focus) {
  const data = JSON.stringify(points);
  const f = focus && focus.lat && focus.lng ? `[${focus.lat}, ${focus.lng}]` : 'null';
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0}.lbl{font-family:sans-serif}</style>
</head><body><div id="map"></div><script>
var pts = ${data};
var focus = ${f};
var map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
var coords = [];
var focusMarker = null;
pts.forEach(function (p) {
  var color = p.status === 'working' ? '#10B981' : p.status === 'done' ? '#3B82F6' : '#9CA3AF';
  var size = p.status === 'working' ? 20 : 16;
  var icon = L.divIcon({
    className: '',
    html: '<div style="background:' + color + ';width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.45)' + (p.status === 'working' ? ';animation:pulse 2s infinite' : '') + '"></div>',
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
  var m = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
  var statusLabel = p.status === 'working' ? '<span style="color:#10B981;font-weight:bold">● Working</span>'
    : p.status === 'done' ? '<span style="color:#3B82F6;font-weight:bold">● Checked out</span>'
    : '<span style="color:#9CA3AF">● Offline</span>';
  m.bindPopup('<div class="lbl"><b>' + p.name + '</b><br/>' + statusLabel + '<br/>' + (p.area ? p.area + '<br/>' : '') + p.ago + '</div>');
  coords.push([p.lat, p.lng]);
  if (focus && Math.abs(p.lat - focus[0]) < 0.00001 && Math.abs(p.lng - focus[1]) < 0.00001) {
    focusMarker = m;
  }
});
if (focus) {
  map.setView(focus, 17);
  if (focusMarker) { focusMarker.openPopup(); }
} else if (coords.length === 1) {
  map.setView(coords[0], 16);
} else if (coords.length > 1) {
  map.fitBounds(coords, { padding: [40, 40] });
} else {
  map.setView([20.5937, 78.9629], 5);
}
</script>
<style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
</body></html>`;
}

export default function TeamMapScreen({ route }) {
  const insets = useSafeAreaInsets();
  const focus = route?.params?.focus || null;
  const [html, setHtml] = useState(null);
  const [stats, setStats] = useState({ working: 0, done: 0, total: 0 });
  const [filter, setFilter] = useState('all'); // all | working | done
  const [loading, setLoading] = useState(true);
  const [allPoints, setAllPoints] = useState([]);

  const load = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [locRes, attRes] = await Promise.all([
        locationsApi.list(),
        attendanceApi.byDate(today),
      ]);

      const attMap = {};
      (attRes.data || []).forEach((a) => {
        const uid = String(a.userId?._id || a.userId);
        const punchedIn = a.punchIn && !a.punchOut;
        const checkedOut = a.punchIn && a.punchOut;
        attMap[uid] = punchedIn ? 'working' : checkedOut ? 'done' : 'absent';
      });

      const locations = (locRes.data || []).filter((l) => l.lat && l.lng);
      const points = locations
        .map((l) => {
          const uid = String(l.userId?._id || l.userId);
          const status = attMap[uid] || 'absent';
          if (status === 'absent') return null;
          const lastSeenMs = l.lastSeen ? new Date(l.lastSeen).getTime() : 0;
          return {
            name: l.name || l.userId?.name || 'Team member',
            lat: l.lat,
            lng: l.lng,
            area: l.area || '',
            status,
            online: !!(lastSeenMs && Date.now() - lastSeenMs < STALE_MS),
            ago: agoText(lastSeenMs),
          };
        })
        .filter(Boolean);

      const working = points.filter((p) => p.status === 'working').length;
      const done = points.filter((p) => p.status === 'done').length;
      setStats({ working, done, total: points.length });
      setAllPoints(points);
      setHtml(buildHtml(points, focus));
    } catch (e) {
      console.log('Error loading team map', e);
      setHtml(buildHtml([], focus));
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = useCallback((key) => {
    setFilter(key);
    const filtered = key === 'all' ? allPoints : allPoints.filter((p) => p.status === key);
    setHtml(buildHtml(filtered, focus));
  }, [allPoints, focus]);

  useFocusEffect(useCallback(() => { setFilter('all'); load(); }, []));

  if (loading || !html) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>
        )}
      />
      {/* Legend + filter chips */}
      <View style={[styles.legend, { top: insets.top + 12 }]}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => applyFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({stats.total})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'working' && styles.filterChipActiveGreen]}
          onPress={() => applyFilter('working')}
        >
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.filterText, filter === 'working' && styles.filterTextActive]}>
            Working ({stats.working})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'done' && styles.filterChipActiveBlue]}
          onPress={() => applyFilter('done')}
        >
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={[styles.filterText, filter === 'done' && styles.filterTextActive]}>
            Done ({stats.done})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  legend: {
    position: 'absolute', top: 12, left: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  filterChipActive: { backgroundColor: Theme.colors.primary },
  filterChipActiveGreen: { backgroundColor: '#10B981' },
  filterChipActiveBlue: { backgroundColor: '#3B82F6' },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.text, fontWeight: Theme.typography.weights.bold },
  filterTextActive: { color: '#fff' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
});
