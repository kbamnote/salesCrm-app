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
import * as Location from 'expo-location';
// Importing this registers the OS background task at startup (side effect).
import { LOCATION_TASK_NAME } from './location/backgroundTask';
import TrackingManager from './location/TrackingManager';

export { LOCATION_TASK_NAME };

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
  const fg = prompt
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { granted: false, reason: 'foreground-denied' };

  const bg = prompt
    ? await Location.requestBackgroundPermissionsAsync()
    : await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { granted: false, reason: 'background-denied' };

  return { granted: true };
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
