/**
 * SocketService — single shared Socket.IO connection for the whole app.
 *
 * Used by two kinds of clients:
 *   - Field reps  → emit `location:update` while punched in (TrackingManager).
 *   - Managers    → listen for `location:live` on the dashboards.
 *
 * Auto-reconnect, backoff and heartbeats are handled by socket.io-client. We
 * expose a tiny surface: connect / disconnect / emitLocation / on / isConnected.
 */
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../../api';

let socket = null;
const liveListeners = new Set();    // callbacks for `location:live`
const connectListeners = new Set(); // callbacks fired when (re)connected
const chatListeners = new Set();    // callbacks for `chat:message`
const chatReadListeners = new Set(); // callbacks for `chat:read`
const chatGroupListeners = new Set(); // callbacks for `chat:group` (renamed / members changed / deleted)
const waIncomingListeners = new Set(); // callbacks for `whatsapp:incoming`
const waSentListeners = new Set();     // callbacks for `whatsapp:sent`

async function connect() {
  if (socket && socket.connected) return socket;
  const token = await AsyncStorage.getItem('token');
  if (!token) return null;

  // Reuse an existing (disconnected) instance if we have one; otherwise create.
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    });

    socket.on('connect', () => {
      connectListeners.forEach((cb) => { try { cb(); } catch (_) {} });
    });
    socket.on('location:live', (data) => {
      liveListeners.forEach((cb) => { try { cb(data); } catch (_) {} });
    });
    socket.on('chat:message', (msg) => {
      chatListeners.forEach((cb) => { try { cb(msg); } catch (_) {} });
    });
    socket.on('chat:read', (data) => {
      chatReadListeners.forEach((cb) => { try { cb(data); } catch (_) {} });
    });
    socket.on('chat:group', (data) => {
      chatGroupListeners.forEach((cb) => { try { cb(data); } catch (_) {} });
    });
    socket.on('whatsapp:incoming', (doc) => {
      waIncomingListeners.forEach((cb) => { try { cb(doc); } catch (_) {} });
    });
    socket.on('whatsapp:sent', (doc) => {
      waSentListeners.forEach((cb) => { try { cb(doc); } catch (_) {} });
    });
    socket.on('connect_error', (e) => console.log('[Socket] connect_error:', e.message));
  } else {
    // Refresh auth token in case it changed, then reconnect.
    socket.auth = { token };
    socket.connect();
  }
  return socket;
}

function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function isConnected() {
  return !!(socket && socket.connected);
}

/**
 * Emit one fix or an array of fixes. Returns a promise that resolves true when
 * the server acks, false on timeout/failure (caller can then queue).
 */
function emitLocation(payload) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve(false);
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const t = setTimeout(() => done(false), 6000);
    socket.emit('location:update', payload, (res) => {
      clearTimeout(t);
      done(!!(res && res.ok));
    });
  });
}

// Subscribe to live updates (managers). Returns an unsubscribe fn.
function onLive(cb) {
  liveListeners.add(cb);
  return () => liveListeners.delete(cb);
}

// Subscribe to (re)connection events (used to flush the offline queue).
function onConnect(cb) {
  connectListeners.add(cb);
  return () => connectListeners.delete(cb);
}

// Subscribe to incoming chat messages. Returns an unsubscribe fn.
function onChat(cb) {
  chatListeners.add(cb);
  return () => chatListeners.delete(cb);
}

// Subscribe to chat read-receipts. Returns an unsubscribe fn.
function onChatRead(cb) {
  chatReadListeners.add(cb);
  return () => chatReadListeners.delete(cb);
}

// Subscribe to group changes (rename / members / delete). Returns an unsubscribe fn.
function onGroup(cb) {
  chatGroupListeners.add(cb);
  return () => chatGroupListeners.delete(cb);
}

// Subscribe to inbound WhatsApp messages (`whatsapp:incoming`). Returns an unsubscribe fn.
function onWhatsappIncoming(cb) {
  waIncomingListeners.add(cb);
  return () => waIncomingListeners.delete(cb);
}

// Subscribe to outbound WhatsApp messages we sent (`whatsapp:sent`). Returns an unsubscribe fn.
function onWhatsappSent(cb) {
  waSentListeners.add(cb);
  return () => waSentListeners.delete(cb);
}

export default {
  connect, disconnect, isConnected, emitLocation,
  onLive, onConnect, onChat, onChatRead, onGroup,
  onWhatsappIncoming, onWhatsappSent,
};
