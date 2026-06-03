import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Platform
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { attendanceApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [punchingIn, setPunchingIn] = useState(false);
  const [punchingOut, setPunchingOut] = useState(false);
  const [todayRecord, setTodayRecord] = useState(null);
  const [monthlyLogs, setMonthlyLogs] = useState([]);
  const [locationGranted, setLocationGranted] = useState(false);
  const [showCamera, setShowCamera] = useState(null); // 'in' or 'out'
  const [cameraRef, setCameraRef] = useState(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, setTick] = useState(0);

  useEffect(() => {
    requestLocationPermission();
    
    // Timer to update live duration every minute
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(status === 'granted');
    if (status !== 'granted') {
      Alert.alert(
        'Location Required',
        'Attendance requires location access to verify your position.',
        [{ text: 'OK' }]
      );
    }
  };

  const loadData = async () => {
    try {
      const month = new Date().toISOString().substring(0, 7);
      const [todayRes, monthRes] = await Promise.allSettled([
        attendanceApi.today(),
        attendanceApi.my(month),
      ]);
      if (todayRes.status === 'fulfilled') setTodayRecord(todayRes.value.data);
      if (monthRes.status === 'fulfilled') setMonthlyLogs(monthRes.value.data || []);
    } catch (e) {
      console.log('Error loading attendance', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const getCurrentLocationAndAddress = async () => {
    if (!locationGranted) {
      await requestLocationPermission();
      return null;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      if (loc.coords.accuracy > 50) {
        Alert.alert('Warning', 'GPS accuracy is greater than 50 meters. Please move outdoors or wait a moment for better signal.');
        return null;
      }

      const { latitude, longitude } = loc.coords;
      let addressString = 'Unknown Address';

      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const place = reverseGeocode[0];
          addressString = [place.name, place.street, place.city, place.region].filter(Boolean).join(', ');
        }
      } catch (geocodeError) {
        console.log('Reverse geocoding failed', geocodeError);
      }

      return { lat: latitude, lng: longitude, address: addressString };
    } catch (e) {
      Alert.alert('Location Error', 'Could not get your current location. Please try again.');
      return null;
    }
  };

  const handlePunchClick = async (type) => {
    if (!locationGranted) {
      await requestLocationPermission();
      return;
    }
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Camera Required', 'Attendance requires a selfie to verify identity.');
        return;
      }
    }
    setShowCamera(type);
  };

  const handleCapture = async () => {
    if (!cameraRef) return;
    
    if (showCamera === 'in') setPunchingIn(true);
    else setPunchingOut(true);
    
    const type = showCamera;

    try {
      const photo = await cameraRef.takePictureAsync({ base64: true, quality: 0.3 });
      
      // Hide camera after picture is taken
      setShowCamera(null);
      
      const locData = await getCurrentLocationAndAddress();
      if (!locData) throw new Error('Could not get accurate location. Punch cancelled.');

      // Cloudinary configuration (User provided Cloud name: dpreeciaf)
      const CLOUD_NAME = 'dpreeciaf';
      const UPLOAD_PRESET = 'salescrm_attendance'; // IMPORTANT: Create this unsigned preset in Cloudinary
      
      let selfieUrl = `data:image/jpeg;base64,${photo.base64}`; // fallback
      
      try {
        const { uploadToCloudinary } = require('../../services/cloudinary');
        selfieUrl = await uploadToCloudinary(photo.base64, CLOUD_NAME, UPLOAD_PRESET);
      } catch (uploadErr) {
        console.log('Cloudinary upload error:', uploadErr);
        Alert.alert('Upload Warning', 'Failed to upload image to cloud. Proceeding with fallback.');
      }

      const payload = {
        ...locData,
        selfie: selfieUrl
      };

      if (type === 'in') {
        await attendanceApi.punchIn(payload);
        Alert.alert('✅ Punched In!', `Location & selfie captured at ${new Date().toLocaleTimeString()}`);
      } else {
        await attendanceApi.punchOut(payload);
        Alert.alert('👋 Punched Out!', `See you tomorrow! Time: ${new Date().toLocaleTimeString()}`);
      }
      loadData();
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to punch. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setPunchingIn(false);
      setPunchingOut(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString([], { day: 'numeric', month: 'short', weekday: 'short' });
  };

  const getDuration = (punchIn, punchOut) => {
    if (!punchIn) return '--';
    const end = punchOut ? new Date(punchOut) : new Date();
    const diff = Math.floor((end - new Date(punchIn)) / 1000 / 60);
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hrs}h ${mins}m`;
  };

  const isPunchedIn = todayRecord?.punchIn && !todayRecord?.punchOut;
  const isPunchedOut = todayRecord?.punchIn && todayRecord?.punchOut;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  if (showCamera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="front"
          ref={(ref) => setCameraRef(ref)}
        >
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraText}>Take a selfie for Attendance</Text>
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCamera(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Theme.colors.primary} />}
    >
      {/* Today's Status Card */}
      <View style={styles.todayCard}>
        <Text style={styles.todayTitle}>Today's Attendance</Text>
        <Text style={styles.todayDate}>{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

        <View style={styles.timesRow}>
          <View style={styles.timeBlock}>
            <Ionicons name="log-in-outline" size={24} color={Theme.colors.success} />
            <Text style={styles.timeLabel}>Punch In</Text>
            <Text style={styles.timeValue}>{formatTime(todayRecord?.punchIn?.time)}</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBlock}>
            <Ionicons name="time-outline" size={24} color={Theme.colors.warning} />
            <Text style={styles.timeLabel}>Duration</Text>
            <Text style={styles.timeValue}>{getDuration(todayRecord?.punchIn?.time, todayRecord?.punchOut?.time)}</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBlock}>
            <Ionicons name="log-out-outline" size={24} color={Theme.colors.error} />
            <Text style={styles.timeLabel}>Punch Out</Text>
            <Text style={styles.timeValue}>{formatTime(todayRecord?.punchOut?.time)}</Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, isPunchedOut ? styles.badgeDone : isPunchedIn ? styles.badgeActive : styles.badgeAbsent]}>
          <Ionicons
            name={isPunchedOut ? 'checkmark-circle' : isPunchedIn ? 'radio-button-on' : 'close-circle'}
            size={16}
            color={isPunchedOut ? '#065F46' : isPunchedIn ? '#1E3A8A' : '#991B1B'}
          />
          <Text style={[styles.statusText, isPunchedOut ? styles.statusDone : isPunchedIn ? styles.statusActive : styles.statusAbsent]}>
            {isPunchedOut ? 'Completed' : isPunchedIn ? 'Currently Working' : 'Not Checked In'}
          </Text>
        </View>

        {/* Action Buttons */}
        {!isPunchedOut && (
          <View style={styles.actionRow}>
            {!isPunchedIn && (
              <TouchableOpacity
                style={[styles.punchBtn, styles.punchInBtn]}
                onPress={() => handlePunchClick('in')}
                disabled={punchingIn}
              >
                {punchingIn ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={22} color="#fff" />
                    <Text style={styles.punchBtnText}>Punch In</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {isPunchedIn && (
              <TouchableOpacity
                style={[styles.punchBtn, styles.punchOutBtn]}
                onPress={() => handlePunchClick('out')}
                disabled={punchingOut}
              >
                {punchingOut ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="exit-outline" size={22} color="#fff" />
                    <Text style={styles.punchBtnText}>Punch Out</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {!locationGranted && (
          <TouchableOpacity style={styles.locationWarning} onPress={requestLocationPermission}>
            <Ionicons name="location-outline" size={16} color="#92400E" />
            <Text style={styles.locationWarningText}>Tap to enable location access</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Monthly Log */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {new Date().toLocaleString('default', { month: 'long' })} — Monthly Log
        </Text>
        {monthlyLogs.length === 0 ? (
          <View style={styles.emptyLog}>
            <Ionicons name="calendar-outline" size={40} color={Theme.colors.border} />
            <Text style={styles.emptyLogText}>No attendance records this month</Text>
          </View>
        ) : (
          monthlyLogs.map((record, index) => (
            <View key={record._id || index} style={styles.logRow}>
              <View style={styles.logDateBox}>
                <Text style={styles.logDay}>{new Date(record.date || record.punchIn?.time).getDate()}</Text>
                <Text style={styles.logMonth}>{new Date(record.date || record.punchIn?.time).toLocaleString('default', { month: 'short' })}</Text>
              </View>
              <View style={styles.logDetails}>
                <Text style={styles.logName}>{formatDate(record.date || record.punchIn?.time)}</Text>
                <Text style={styles.logTime}>
                  {formatTime(record.punchIn?.time)} → {formatTime(record.punchOut?.time)}
                  {'  '}
                  <Text style={styles.logDuration}>{getDuration(record.punchIn?.time, record.punchOut?.time)}</Text>
                </Text>
              </View>
              <View style={[styles.logBadge, record.punchOut ? styles.badgeDone : styles.badgeActive]}>
                <Text style={[styles.logBadgeText, record.punchOut ? styles.statusDone : styles.statusActive]}>
                  {record.punchOut ? 'Done' : 'Active'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  todayCard: {
    backgroundColor: Theme.colors.white,
    margin: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  todayTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  todayDate: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: Theme.spacing.l,
  },
  timesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.m,
  },
  timeBlock: { flex: 1, alignItems: 'center' },
  timeDivider: { width: 1, height: 50, backgroundColor: Theme.colors.border },
  timeLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  timeValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Theme.borderRadius.round,
    alignSelf: 'center',
    marginBottom: Theme.spacing.m,
  },
  badgeDone: { backgroundColor: '#D1FAE5' },
  badgeActive: { backgroundColor: '#DBEAFE' },
  badgeAbsent: { backgroundColor: '#FEE2E2' },
  statusText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    marginLeft: 6,
  },
  statusDone: { color: '#065F46' },
  statusActive: { color: '#1E3A8A' },
  statusAbsent: { color: '#991B1B' },
  actionRow: { marginTop: 4 },
  punchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.m,
    gap: 10,
  },
  punchInBtn: { backgroundColor: Theme.colors.success },
  punchOutBtn: { backgroundColor: Theme.colors.error },
  punchBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  locationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: Theme.spacing.s,
    borderRadius: Theme.borderRadius.s,
    marginTop: Theme.spacing.m,
    gap: 6,
  },
  locationWarningText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: '#92400E',
  },
  section: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginBottom: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginBottom: Theme.spacing.m,
  },
  emptyLog: { alignItems: 'center', paddingVertical: Theme.spacing.xl },
  emptyLogText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.s,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  logDateBox: {
    width: 44,
    height: 44,
    borderRadius: Theme.borderRadius.m,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.m,
  },
  logDay: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  logMonth: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  logDetails: { flex: 1 },
  logName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.medium,
    color: Theme.colors.text,
  },
  logTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  logDuration: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  logBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.round,
  },
  logBadgeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: Theme.typography.weights.bold,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  cameraText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 40,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingBottom: 40,
  },
  cancelButton: {
    padding: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
  },
});
