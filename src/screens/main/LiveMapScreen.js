import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fieldVisitsApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function LiveMapScreen() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [mapRef, setMapRef] = useState(null);

  const loadData = async () => {
    try {
      // Get user's current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
      // Load field visits
      const res = await fieldVisitsApi.list();
      setVisits(res.data || []);
    } catch (e) {
      console.log('Error loading map data', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const getInitialRegion = () => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Fallback to India center
    return {
      latitude: 20.5937,
      longitude: 78.9629,
      latitudeDelta: 10,
      longitudeDelta: 10,
    };
  };

  const goToMyLocation = () => {
    if (userLocation && mapRef) {
      mapRef.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  const mapVisits = visits.filter((v) => v.lat && v.lng);

  return (
    <View style={styles.container}>
      <MapView
        ref={(ref) => setMapRef(ref)}
        style={styles.map}
        initialRegion={getInitialRegion()}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
      >
        {mapVisits.map((visit, index) => (
          <Marker
            key={visit._id || index}
            coordinate={{
              latitude: parseFloat(visit.lat),
              longitude: parseFloat(visit.lng),
            }}
            pinColor={Theme.colors.primary}
          >
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutClient}>{visit.clientName || 'Visit'}</Text>
                {visit.purpose ? <Text style={styles.calloutPurpose}>{visit.purpose}</Text> : null}
                <Text style={styles.calloutTime}>{formatDateTime(visit.createdAt)}</Text>
                {visit.notes ? <Text style={styles.calloutNotes}>{visit.notes}</Text> : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Stats Overlay */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{mapVisits.length}</Text>
          <Text style={styles.statLabel}>Visit{mapVisits.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{new Set(mapVisits.map(v => v.clientName)).size}</Text>
          <Text style={styles.statLabel}>Client{new Set(mapVisits.map(v => v.clientName)).size !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* My Location FAB */}
      {userLocation && (
        <TouchableOpacity style={styles.locationFab} onPress={goToMyLocation}>
          <Ionicons name="locate" size={24} color={Theme.colors.primary} />
        </TouchableOpacity>
      )}

      {mapVisits.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Ionicons name="map-outline" size={40} color={Theme.colors.textSecondary} />
          <Text style={styles.emptyText}>No field visits with GPS data</Text>
          <Text style={styles.emptySubText}>Log field visits to see them on the map</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  loadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  map: { flex: 1 },
  statsBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Theme.borderRadius.l,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  statItem: { alignItems: 'center' },
  statNumber: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  statLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  statDivider: { width: 1, height: 30, backgroundColor: Theme.colors.border, marginHorizontal: 16 },
  locationFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  callout: {
    backgroundColor: '#fff',
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    minWidth: 180,
    maxWidth: 250,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  calloutClient: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginBottom: 4,
  },
  calloutPurpose: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.primary,
    marginBottom: 4,
  },
  calloutTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  calloutNotes: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginTop: Theme.spacing.s,
  },
  emptySubText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
