/**
 * offlineQueue — durable buffer for location fixes that couldn't be delivered.
 *
 * Shared by the foreground TrackingManager and the OS background task so a fix
 * is never lost during a network/socket drop. Backed by AsyncStorage; capped so
 * a long offline spell can't grow unbounded.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUEUE_KEY = 'locationQueue';
const QUEUE_MAX = 500;

export async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

export async function writeQueue(arr) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(arr.slice(-QUEUE_MAX)));
  } catch (_) { /* ignore */ }
}

export async function enqueue(fix) {
  const q = await readQueue();
  q.push(fix);
  await writeQueue(q);
}

export async function clearQueue() {
  try { await AsyncStorage.removeItem(QUEUE_KEY); } catch (_) { /* ignore */ }
}
