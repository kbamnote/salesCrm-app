/**
 * LocationService — foreground high-accuracy GPS acquisition.
 *
 * Runs a single `watchPositionAsync` and applies a smart, battery-aware policy
 * before handing fixes to the caller:
 *   - Accuracy filter: drop fixes worse than MAX_ACCURACY_M (GPS jitter / indoor).
 *   - Motion cadence:  while moving → emit ~every MOVING_MS or MOVING_DIST_M;
 *                      while stationary → a heartbeat ~every STATIONARY_MS.
 *   - De-dup:          never emit a coordinate identical to the last one.
 *
 * The OS background task (backgroundTask.js) handles fixes when the app is not
 * foregrounded; this module only runs while the app is alive in the foreground.
 */
import * as Location from 'expo-location';

// Tunables (Uber-grade cadence while moving).
const MAX_ACCURACY_M = 50;     // reject fixes worse than this radius
const MOVING_MS = 2500;        // min gap between sends while moving
const MOVING_DIST_M = 3;       // ...or after this much movement
const STATIONARY_MS = 12000;   // heartbeat gap while stationary
const MOVING_SPEED = 0.7;      // m/s (~2.5 km/h) — above this we consider "moving"

let subscription = null;
let lastSent = null; // { lat, lng, t }

// Haversine distance in metres.
function distM(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function shouldEmit(fix) {
  if (!lastSent) return true;
  const moved = distM(lastSent, fix);
  if (moved < 0.5) return false; // identical coordinate — drop
  const dt = fix.t - lastSent.t;
  const moving = (fix.speed != null && fix.speed >= MOVING_SPEED) || moved >= MOVING_DIST_M;
  if (moving) return dt >= MOVING_MS || moved >= MOVING_DIST_M;
  return dt >= STATIONARY_MS; // stationary heartbeat
}

/**
 * Start watching. `onFix(fix)` is called for every ACCEPTED fix, where fix is:
 *   { lat, lng, accuracy, speed, heading, ts }
 */
async function start(onFix) {
  if (subscription) return true;

  subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,    // OS may deliver as often as every 2s while moving
      distanceInterval: 0,   // we do our own distance throttling in shouldEmit
      mayShowUserSettingsDialog: true,
    },
    (loc) => {
      const c = loc?.coords;
      if (!c) return;
      // Accuracy filter — drop poor fixes outright.
      if (c.accuracy != null && c.accuracy > MAX_ACCURACY_M) return;

      const fix = {
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy ?? null,
        speed: c.speed != null && c.speed >= 0 ? c.speed : 0,
        heading: c.heading != null && c.heading >= 0 ? c.heading : null,
        ts: loc.timestamp || Date.now(),
        t: Date.now(),
      };

      if (!shouldEmit(fix)) return;
      lastSent = { lat: fix.lat, lng: fix.lng, t: fix.t };
      const { t, ...payload } = fix; // strip internal throttle field
      onFix(payload);
    }
  );
  return true;
}

function stop() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  lastSent = null;
}

function isRunning() {
  return !!subscription;
}

export default { start, stop, isRunning, MAX_ACCURACY_M };
