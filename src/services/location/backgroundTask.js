/**
 * Background location task (OS-level).
 *
 * Runs when the app is minimised / screen-locked, where a live socket can't be
 * reliably kept open. Each batch the OS delivers, we take the freshest accurate
 * fix and POST it over REST (same server persistence + broadcast path). On
 * failure the fix is added to the shared offline queue and flushed later by the
 * foreground TrackingManager.
 *
 * IMPORTANT: defineTask must run in global scope at startup, BEFORE the OS can
 * invoke the task on a cold start — this module is imported from
 * services/locationTracking.js, which index.js imports first.
 */
import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import { locationsApi } from '../../api';
import { enqueue } from './offlineQueue';

export const LOCATION_TASK_NAME = 'salescrm-background-location';

const MAX_ACCURACY_M = 50; // keep in sync with LocationService

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log('[BG location] task error:', error.message);
    return;
  }
  if (!data) return;

  // When the app is in the FOREGROUND, the real-time socket pipeline
  // (LocationService → TrackingManager) owns delivery. Skip here to avoid
  // double-writing the same fix; this task only delivers while backgrounded.
  if (AppState.currentState === 'active') return;

  const { locations } = data;
  const loc = locations?.[locations.length - 1]; // freshest fix in the batch
  const c = loc?.coords;
  if (!c) return;

  // Accuracy filter — drop poor fixes (same rule as the foreground path).
  if (c.accuracy != null && c.accuracy > MAX_ACCURACY_M) return;

  const payload = {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy ?? null,
    speed: c.speed != null && c.speed >= 0 ? c.speed : 0,
    heading: c.heading != null && c.heading >= 0 ? c.heading : null,
    ts: loc.timestamp || Date.now(),
    status: 'active',
  };

  try {
    await locationsApi.update(payload);
  } catch (e) {
    // Network/server down → keep it for the foreground manager to flush.
    await enqueue(payload);
  }
});
