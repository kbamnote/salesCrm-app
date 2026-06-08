import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { locationsApi } from '../api';

// Name of the OS-registered background task. Must be stable across app launches.
export const LOCATION_TASK_NAME = 'salescrm-background-location';

// We only want to hit the network ~every 5 minutes even if the OS hands us
// locations more often (e.g. when the device moves). Throttle on the JS side
// using a persisted timestamp so it survives the headless task being re-spawned.
const POST_INTERVAL_MS = 5 * 60 * 1000;
const LAST_POST_KEY = 'lastLocationPostAt';

// ───────── Background task definition ─────────
// IMPORTANT: defineTask must run in the global scope at startup, BEFORE the OS
// tries to invoke the task on a cold start. This module is imported from
// index.js so registration always happens first.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log('BG location task error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data;
  const loc = locations?.[locations.length - 1]; // most recent fix in the batch
  if (!loc?.coords) return;

  // Throttle network posts to once per ~5 minutes.
  try {
    const last = parseInt((await AsyncStorage.getItem(LAST_POST_KEY)) || '0', 10);
    if (Date.now() - last < POST_INTERVAL_MS - 15000) return; // 15s grace
  } catch (_) { /* if storage read fails, fall through and post */ }

  const { latitude, longitude } = loc.coords;
  try {
    // Coordinates only — reverse geocoding is skipped in the background to save
    // battery and network. The punch-in ping (foreground) seeds the area string.
    await locationsApi.update({ lat: latitude, lng: longitude, status: 'active' });
    await AsyncStorage.setItem(LAST_POST_KEY, String(Date.now()));
  } catch (e) {
    console.log('BG location post failed:', e?.message || e);
  }
});

// ───────── Public helpers ─────────

export async function isTracking() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (_) {
    return false;
  }
}

/**
 * Ensure foreground + background location permission. Returns a reason string
 * when it can't be granted so callers can show the right message.
 * { granted: boolean, reason?: 'foreground-denied' | 'background-denied' }
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
 * Start background tracking. Safe to call repeatedly (no-op if already running).
 * Pass prompt:false to avoid showing permission dialogs (used on app restart).
 */
export async function startBackgroundTracking({ prompt = true } = {}) {
  const perm = await ensureBackgroundPermission({ prompt });
  if (!perm.granted) return perm;

  if (await isTracking()) return { granted: true };

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced, // ~100m: enough for "on the field", easy on battery
    timeInterval: POST_INTERVAL_MS, // Android: desired wake interval
    distanceInterval: 50, // also fire after 50m of movement
    deferredUpdatesInterval: POST_INTERVAL_MS, // let Android batch while backgrounded
    pausesUpdatesAutomatically: false, // iOS: don't let the OS pause us when stationary
    showsBackgroundLocationIndicator: false, // iOS status-bar indicator
    activityType: Location.ActivityType.Other,
    foregroundService: {
      // Android requires a persistent notification for background location.
      notificationTitle: 'Work location sharing is on',
      notificationBody: 'Your location is shared with your manager while you are punched in.',
      notificationColor: '#4a90e2',
    },
  });

  return { granted: true };
}

/** Stop background tracking. Safe to call when not running. */
export async function stopBackgroundTracking() {
  try {
    if (await isTracking()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    await AsyncStorage.removeItem(LAST_POST_KEY);
  } catch (e) {
    console.log('stopBackgroundTracking failed:', e?.message || e);
  }
}
