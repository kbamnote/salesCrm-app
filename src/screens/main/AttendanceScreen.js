import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Platform,
  Modal, TextInput, KeyboardAvoidingView, Keyboard, useWindowDimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceApi, locationsApi } from '../../api';
import { startBackgroundTracking, stopBackgroundTracking, ensureForegroundPermission } from '../../services/locationTracking';
import BackgroundLocationDisclosure from '../../components/BackgroundLocationDisclosure';
import { useAuth } from '../../context/AuthContext';

const BG_CONSENT_KEY = 'bgLocationConsent'; // 'accepted' | 'declined'
import { Theme } from '../../theme/Theme';

// Punch-out daily report is role-specific. Telecallers & HR file a calling
// report; everyone else (sales / manager / TL / BDO …) files a field report.
const CALLING_ROLES = ['telecaller', 'hr', 'assistant_hr'];
const FIELD_METRICS = [
  { key: 'freshPresentation', label: 'Fresh Presentation Done' },
  { key: 'followUpVisit', label: 'Follow up Visit' },
  { key: 'appointmentAssigned', label: 'Appointment Assigned' },
  { key: 'appointmentVisit', label: 'Appointment Visit' },
  { key: 'dealClosed', label: 'Deal Closed' },
];
const CALLING_METRICS = [
  { key: 'totalCalls', label: 'Total Calls Dialed' },
  { key: 'callsConnected', label: 'Calls Connected' },
  { key: 'sameDaySchedule', label: 'Same Day Schedule' },
  { key: 'nextDaySchedule', label: 'Next Day Schedule' },
  { key: 'otherDaySchedule', label: 'Other Day Schedule' },
  { key: 'meetingDone', label: 'Meeting Done' },
  { key: 'dealDone', label: 'Deal Done' },
];

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
  const [showDisclosure, setShowDisclosure] = useState(false);
  const bgConsentRef = useRef(null); // 'accepted' | 'declined' | null

  // Mandatory daily report — collected before the punch-out camera step.
  // Format depends on the user's role (field report vs calling report).
  const { user } = useAuth();
  const reportType = CALLING_ROLES.includes(user?.role) ? 'calling' : 'field';
  const reportMetrics = reportType === 'calling' ? CALLING_METRICS : FIELD_METRICS;
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportValues, setReportValues] = useState({}); // { metricKey: '2', ... }
  const [workCategory, setWorkCategory] = useState(''); // field report only
  const [reportKbPad, setReportKbPad] = useState(0);     // keyboard-aware bottom padding
  const pendingReportRef = useRef(null); // holds the submitted report until punch-out completes
  const setMetric = (k, v) => setReportValues((p) => ({ ...p, [k]: v.replace(/[^0-9]/g, '') }));

  // Report-modal scrolling: keep a focused field above the keyboard (Android
  // modals don't auto-resize, so we scroll the field into view ourselves).
  const { height: winH } = useWindowDimensions();
  const reportScrollRef = useRef(null);
  const reportScrollYRef = useRef(0);
  const reportInputRefs = useRef({});
  const scrollReportFieldIntoView = (inputEl) => {
    const scroll = reportScrollRef.current;
    if (!scroll || !inputEl || typeof inputEl.measure !== 'function') return;
    setTimeout(() => {
      inputEl.measure((x, y, w, h, pageX, pageY) => {
        if (pageY == null || !scroll.scrollTo) return;
        const kb = (Keyboard.metrics && Keyboard.metrics()?.height) || 0;
        const visibleBottom = winH - kb - 24;
        const fieldBottom = pageY + h;
        if (fieldBottom > visibleBottom - 8) {
          const delta = fieldBottom - visibleBottom + 24;
          scroll.scrollTo({ y: Math.max(0, reportScrollYRef.current + delta), animated: true });
        }
      });
    }, 120);
  };

  useEffect(() => {
    AsyncStorage.getItem(BG_CONSENT_KEY).then((v) => { bgConsentRef.current = v; });
    requestLocationPermission();
    
    // Timer to update live duration every minute
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Track the keyboard height so the report sheet can scroll its lower fields
  // clear of the keyboard (Android modals don't auto-resize for the keyboard).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setReportKbPad(e?.endCoordinates?.height || 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setReportKbPad(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const requestLocationPermission = async () => {
    // Shows the prominent disclosure BEFORE the OS permission prompt (Play policy).
    const res = await ensureForegroundPermission();
    setLocationGranted(res.granted);
    if (!res.granted) {
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

  // Show the background-location disclosure before the first punch-in (Play policy:
  // it must precede the background-location permission request).
  const onPunchInPress = () => {
    if (bgConsentRef.current == null) {
      setShowDisclosure(true);
      return;
    }
    handlePunchClick('in');
  };

  const acceptDisclosure = async () => {
    bgConsentRef.current = 'accepted';
    await AsyncStorage.setItem(BG_CONSENT_KEY, 'accepted');
    setShowDisclosure(false);
    handlePunchClick('in');
  };

  const declineDisclosure = async () => {
    // Still allow attendance — just don't start background tracking.
    bgConsentRef.current = 'declined';
    await AsyncStorage.setItem(BG_CONSENT_KEY, 'declined');
    setShowDisclosure(false);
    handlePunchClick('in');
  };

  // Punch-out requires a daily report first — open that modal instead of the
  // camera directly. The camera/location step only runs after it's submitted.
  const onPunchOutPress = () => {
    setReportValues({});
    setWorkCategory('');
    setReportModalOpen(true);
  };

  const submitReport = () => {
    const num = (k) => { const n = parseInt(reportValues[k], 10); return Number.isFinite(n) ? n : 0; };

    let report;
    if (reportType === 'calling') {
      report = {
        type: 'calling',
        totalCalls: num('totalCalls'),
        callsConnected: num('callsConnected'),
        sameDaySchedule: num('sameDaySchedule'),
        nextDaySchedule: num('nextDaySchedule'),
        otherDaySchedule: num('otherDaySchedule'),
        meetingDone: num('meetingDone'),
        dealDone: num('dealDone'),
      };
    } else {
      if (!workCategory.trim()) {
        return Alert.alert('Work category required', "Please enter today's work category before punching out.");
      }
      report = {
        type: 'field',
        freshPresentation: num('freshPresentation'),
        followUpVisit: num('followUpVisit'),
        appointmentAssigned: num('appointmentAssigned'),
        appointmentVisit: num('appointmentVisit'),
        dealClosed: num('dealClosed'),
        workCategory: workCategory.trim(),
      };
    }

    pendingReportRef.current = report;
    Keyboard.dismiss();
    setReportModalOpen(false);
    handlePunchClick('out');
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
        // Seed the admin map immediately with location + area (background pings
        // that follow are coordinate-only to save battery/network).
        locationsApi.update({ lat: locData.lat, lng: locData.lng, area: locData.address, status: 'active' })
          .catch((err) => console.log('Initial location update failed', err?.message || err));
        // Start background tracking (only if the user accepted the disclosure)
        // so we keep reporting even when the app is minimized / locked.
        if (bgConsentRef.current === 'accepted') {
          const track = await startBackgroundTracking({ prompt: true });
          if (!track.granted) {
            Alert.alert(
              'Background location needed',
              track.reason === 'background-denied'
                ? 'Please set location permission to "Allow all the time" so your work location is shared while the app is in the background.'
                : 'Location permission is required to track your field activity during working hours.'
            );
          }
        }
        Alert.alert('✅ Punched In!', `Location & selfie captured at ${new Date().toLocaleTimeString()}`);
      } else {
        // Attach the mandatory daily report captured before the camera step.
        await attendanceApi.punchOut({ ...payload, report: pendingReportRef.current });
        pendingReportRef.current = null;
        // Stop tracking and mark them offline on the admin map once the shift ends.
        await stopBackgroundTracking();
        locationsApi.update({ lat: locData.lat, lng: locData.lng, area: locData.address, status: 'offline' })
          .catch((err) => console.log('Final location update failed', err?.message || err));
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
    <>
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
                onPress={onPunchInPress}
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
                onPress={onPunchOutPress}
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

    <BackgroundLocationDisclosure
      visible={showDisclosure}
      onAccept={acceptDisclosure}
      onDecline={declineDisclosure}
    />

    {/* Mandatory daily report — shown before punch-out */}
    <Modal visible={reportModalOpen} animationType="slide" transparent onRequestClose={() => setReportModalOpen(false)}>
      <KeyboardAvoidingView style={styles.reportOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.reportSheet}>
          <View style={styles.reportHeader}>
            <View>
              <Text style={styles.reportTitle}>{reportType === 'calling' ? 'Calling Report' : 'Daily Report'}</Text>
              <Text style={styles.reportSubtitle}>Required to punch out</Text>
            </View>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setReportModalOpen(false); }}>
              <Ionicons name="close" size={24} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={reportScrollRef}
            contentContainerStyle={{ padding: 18, paddingBottom: 28 + reportKbPad }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={(e) => { reportScrollYRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            {reportMetrics.map((m) => (
              <View key={m.key} style={styles.metricRow}>
                <Text style={styles.metricLabel}>{m.label}</Text>
                <TextInput
                  ref={(el) => { reportInputRefs.current[m.key] = el; }}
                  style={styles.metricInput}
                  value={reportValues[m.key] ?? ''}
                  onChangeText={(v) => setMetric(m.key, v)}
                  onFocus={() => scrollReportFieldIntoView(reportInputRefs.current[m.key])}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Theme.colors.textSecondary}
                  maxLength={5}
                />
              </View>
            ))}

            {reportType === 'field' && (
              <>
                <Text style={styles.reportLabel}>Today's Work Category *</Text>
                <TextInput
                  ref={(el) => { reportInputRefs.current.workCategory = el; }}
                  style={[styles.reportInput, { height: 70, textAlignVertical: 'top' }]}
                  value={workCategory}
                  onChangeText={setWorkCategory}
                  onFocus={() => scrollReportFieldIntoView(reportInputRefs.current.workCategory)}
                  multiline
                  placeholder="e.g. Builder and developer, Financial services"
                  placeholderTextColor={Theme.colors.textSecondary}
                />
              </>
            )}

            <TouchableOpacity style={styles.reportSubmit} onPress={submitReport}>
              <Ionicons name="exit-outline" size={18} color="#fff" />
              <Text style={styles.reportSubmitText}>Submit & Continue Punch Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
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
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  reportSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 18, borderBottomWidth: 1, borderBottomColor: Theme.colors.border,
  },
  reportTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  reportSubtitle: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.error, marginTop: 2, fontWeight: '600' },
  reportLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  reportInput: {
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text,
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF1F5', gap: 12,
  },
  metricLabel: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text, fontWeight: '600' },
  metricInput: {
    width: 76, textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1,
    borderColor: Theme.colors.border, paddingHorizontal: 10, paddingVertical: 10,
    fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '700', color: Theme.colors.text,
  },
  reportSubmit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.error, borderRadius: 12, paddingVertical: 14, marginTop: 22,
  },
  reportSubmitText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
});
