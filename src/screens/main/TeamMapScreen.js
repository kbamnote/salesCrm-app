import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { locationsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STALE_MS = 12 * 60 * 1000;

const agoText = (ms) => {
  if (!ms) return 'no recent update';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

// Builds a self-contained Leaflet (OpenStreetMap) page with all rep pins.
// No API key required — tiles come from the free OpenStreetMap tile server.
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
  var color = p.online ? '#10B981' : '#9CA3AF';
  var icon = L.divIcon({
    className: '',
    html: '<div style="background:' + color + ';width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 5px rgba(0,0,0,.45)"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9]
  });
  var m = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
  m.bindPopup('<div class="lbl"><b>' + p.name + '</b><br/>' + (p.area ? p.area + '<br/>' : '') + p.ago + '</div>');
  coords.push([p.lat, p.lng]);
  // Identify the focused person's marker (match by coordinates).
  if (focus && Math.abs(p.lat - focus[0]) < 0.00001 && Math.abs(p.lng - focus[1]) < 0.00001) {
    focusMarker = m;
  }
});
if (focus) {
  map.setView(focus, 17);             // zoom in tight on the exact spot
  if (focusMarker) { focusMarker.openPopup(); }
} else if (coords.length === 1) {
  map.setView(coords[0], 16);
} else if (coords.length > 1) {
  map.fitBounds(coords, { padding: [40, 40] });
} else {
  map.setView([20.5937, 78.9629], 5); // India fallback
}
</script></body></html>`;
}

export default function TeamMapScreen({ route }) {
  const insets = useSafeAreaInsets();
  const focus = route?.params?.focus || null;
  const [html, setHtml] = useState(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await locationsApi.list();
      const points = (res.data || [])
        .filter((l) => l.lat && l.lng)
        .map((l) => {
          const lastSeenMs = l.lastSeen ? new Date(l.lastSeen).getTime() : 0;
          return {
            name: l.name || l.userId?.name || 'Team member',
            lat: l.lat,
            lng: l.lng,
            area: l.area || '',
            online: !!(lastSeenMs && Date.now() - lastSeenMs < STALE_MS),
            ago: agoText(lastSeenMs),
          };
        });
      setCount(points.length);
      setHtml(buildHtml(points, focus));
    } catch (e) {
      console.log('Error loading team map', e);
      setHtml(buildHtml([], focus));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

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
      <View style={[styles.legend, { top: insets.top + 12 }]}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#10B981' }]} /><Text style={styles.legendText}>Online</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#9CA3AF' }]} /><Text style={styles.legendText}>Offline</Text></View>
        <Text style={styles.legendCount}>{count} located</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  legend: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff' },
  legendText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.text },
  legendCount: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: Theme.typography.weights.bold },
});
