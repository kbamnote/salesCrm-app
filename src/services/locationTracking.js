/**
 * locationTracking — public facade for the real-time tracking system.
 *
 * Keeps the original exported API (startBackgroundTracking / stopBackgroundTracking
 * / isTracking / ensureBackgroundPermission / LOCATION_TASK_NAME) so existing
 * callers (AttendanceScreen punch-in/out, LocationReporter, AuthContext logout)
 * keep working unchanged — but internally everything now flows through the new
 * modular stack:
 *
 *   LocationService  → high-accuracy GPS + smart cadence (foreground)
 *   SocketService    → real-time Socket.IO channel
 *   TrackingManager  → routing + offline queue + reconnect flush
 *   backgroundTask   → OS background updates (app minimised / locked)
 *
 * Tracking lifetime is still gated by attendance: it starts on punch-in and
 * stops on punch-out / logout (unchanged behaviour).
 */
import { Alert } from 'react-native';
import * as Location from 'expo-location';
// Importing this registers the OS background task at startup (side effect).
import { LOCATION_TASK_NAME } from './location/backgroundTask';
import TrackingManager from './location/TrackingManager';

export { LOCATION_TASK_NAME };

/**
 * Google Play "Prominent Disclosure and Consent" requirement: before requesting
 * location (especially BACKGROUND location), we must show an in-app disclosure
 * that states what we collect, that it's collected in the background, the purpose,
 * and get affirmative consent — immediately before the OS permission prompt.
 * Resolves true only if the user taps "Allow".
 */
function showLocationDisclosure() {
  return new Promise((resolve) => {
    Alert.alert(
      'Location access',
      'Tapify collects your location — including in the background, while the app is ' +
        'closed or not in use — to share your live location and route with your managers ' +
        'for attendance and field-visit tracking.\n\n' +
        'This happens only during your working hours, after you punch in for attendance, ' +
        'and stops when you punch out.\n\n' +
        'Do you allow Tapify to collect this location data?',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
}

export async function isTracking() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (_) {
    return false;
  }
}

/**
 * Ensure foreground + background location permission.
 * Returns { granted, reason? } where reason ∈ 'foreground-denied' | 'background-denied'.
 */
export async function ensureBackgroundPermission({ prompt = true } = {}) {
  // Check current status first — if it's already granted, no OS prompt will show,
  // so we must NOT nag the user with the disclosure again.
  const fgCurrent = await Location.getForegroundPermissionsAsync();
  const bgCurrent = await Location.getBackgroundPermissionsAsync();
  const alreadyGranted = fgCurrent.status === 'granted' && bgCurrent.status === 'granted';

  // Prominent disclosure MUST precede the runtime permission request (Google Play).
  if (prompt && !alreadyGranted) {
    const consented = await showLocationDisclosure();
    if (!consented) return { granted: false, reason: 'disclosure-declined' };
  }

  const fg = prompt ? await Location.requestForegroundPermissionsAsync() : fgCurrent;
  if (fg.status !== 'granted') return { granted: false, reason: 'foreground-denied' };

  const bg = prompt ? await Location.requestBackgroundPermissionsAsync() : bgCurrent;
  if (bg.status !== 'granted') return { granted: false, reason: 'background-denied' };

  return { granted: true };
}

/**
 * Ensure FOREGROUND location permission, showing the prominent disclosure first
 * (Google Play requires the disclosure immediately before the runtime prompt).
 * Use this everywhere the app asks for location (attendance, field visits,
 * presentations) so no permission request is ever unpreceded by a disclosure.
 * Returns { granted, reason? }.
 */
export async function ensureForegroundPermission() {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.status === 'granted') return { granted: true };

  const consented = await showLocationDisclosure();
  if (!consented) return { granted: false, reason: 'disclosure-declined' };

  const fg = await Location.requestForegroundPermissionsAsync();
  return fg.status === 'granted' ? { granted: true } : { granted: false, reason: 'foreground-denied' };
}

/**
 * Start tracking. Safe to call repeatedly. Pass prompt:false to resume silently
 * (used on app restart) without showing permission dialogs.
 *
 * Starts BOTH:
 *   - the foreground real-time pipeline (TrackingManager → socket), and
 *   - the OS background location updates (continue when minimised / locked).
 */
export async function startBackgroundTracking({ prompt = true } = {}) {
  const perm = await ensureBackgroundPermission({ prompt });
  if (!perm.granted) return perm;

  // Foreground real-time pipeline (no-op if already running).
  await TrackingManager.start();

  // OS background updates (continue while app is not foregrounded).
  if (!(await isTracking())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,        // Android: desired wake interval while moving
      distanceInterval: 5,       // also fire after 5 m of movement
      pausesUpdatesAutomatically: false, // iOS: keep going when stationary
      showsBackgroundLocationIndicator: false,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: 'Work location sharing is on',
        notificationBody: 'Your location is shared with your manager while you are punched in.',
        notificationColor: '#4a90e2',
      },
    });
  }

  return { granted: true };
}

/** Stop tracking (foreground pipeline + OS background updates). */
export async function stopBackgroundTracking() {
  try {
    await TrackingManager.stop();
    if (await isTracking()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (e) {
    console.log('stopBackgroundTracking failed:', e?.message || e);
  }
}
