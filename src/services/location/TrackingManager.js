/**
 * TrackingManager — orchestrates real-time location for a field rep.
 *
 * Responsibilities:
 *   - Connect the shared socket and start the foreground GPS watch.
 *   - Route each accepted fix: emit over socket; on failure, fall back to REST,
 *     and if that also fails, persist it to an offline queue (AsyncStorage).
 *   - Flush the queue automatically whenever the socket (re)connects, so no
 *     fix is lost during a temporary network drop.
 *
 * Background delivery (app minimised / screen locked) is handled separately by
 * the OS task in backgroundTask.js; this manager owns the foreground path.
 */
import { locationsApi } from '../../api';
import LocationService from './LocationService';
import SocketService from './SocketService';
import { readQueue, enqueue, clearQueue } from './offlineQueue';

let running = false;
let unsubscribeConnect = null;

// Send everything queued in one batch; clear on success.
async function flushQueue() {
  const q = await readQueue();
  if (q.length === 0) return;
  const ok = await SocketService.emitLocation(q);
  if (ok) {
    await clearQueue();
  }
}

// Route a single accepted fix.
async function handleFix(fix) {
  const payload = { ...fix, status: 'active' };

  // 1) Try real-time socket.
  if (SocketService.isConnected()) {
    const ok = await SocketService.emitLocation(payload);
    if (ok) { flushQueue(); return; }
  }

  // 2) Fall back to REST (still hits the same server persistence path).
  try {
    await locationsApi.update(payload);
    return;
  } catch (_) { /* fall through to queue */ }

  // 3) Persist for later.
  await enqueue(payload);
}

async function start() {
  if (running) return;
  running = true;

  await SocketService.connect();
  // Flush any backlog as soon as we (re)connect.
  unsubscribeConnect = SocketService.onConnect(() => { flushQueue(); });

  await LocationService.start(handleFix);
  // Opportunistic flush at startup in case we have a backlog and are online.
  flushQueue();
}

async function stop() {
  running = false;
  LocationService.stop();
  if (unsubscribeConnect) { unsubscribeConnect(); unsubscribeConnect = null; }
  // Flush remaining points before tearing the socket down (best-effort).
  await flushQueue();
  SocketService.disconnect();
}

function isRunning() {
  return running;
}

export default { start, stop, isRunning, flushQueue };
