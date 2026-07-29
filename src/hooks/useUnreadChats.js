import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { chatApi } from '../api';
import SocketService from '../services/location/SocketService';

/**
 * Total unread team-chat messages for the logged-in user, kept live (WhatsApp-style
 * badge on the Chat tab).
 *
 * The count comes from GET /chat/conversations, which already returns a per-chat
 * `unread` for the requesting user; we just sum it. It is re-fetched on:
 *   - `chat:message`  — someone sent a message
 *   - `chat:read`     — a participant read messages
 *   - socket reconnect — mobile sockets silently miss events while backgrounded,
 *                        so a reconnect must resync rather than trust the stream
 *   - app foreground   — same reason, for the case where the socket stayed down
 *   - leaving ChatRoom — the server emits `chat:read` to the OTHER participants,
 *                        not to the reader, so our own badge needs a local nudge
 *
 * @param {string} currentRoute active route name, used for the leaving-a-chat case
 * @returns {number} total unread messages (0 when none / not logged in)
 */
export default function useUnreadChats(currentRoute) {
  const [count, setCount] = useState(0);
  const timer = useRef(null);
  const prevRoute = useRef(currentRoute);

  const refresh = useCallback(async () => {
    try {
      const res = await chatApi.conversations();
      const total = (res.data || []).reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
      setCount(total);
    } catch (_) {
      // Offline, logged out, or a transient error — keep the last known count
      // rather than flashing the badge away.
    }
  }, []);

  // Debounce: a burst of messages shouldn't fire a request per message.
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 400);
  }, [refresh]);

  useEffect(() => {
    let unsubMsg = null, unsubRead = null, unsubConn = null;
    refresh();
    (async () => {
      await SocketService.connect();
      unsubMsg = SocketService.onChat(scheduleRefresh);
      unsubRead = SocketService.onChatRead(scheduleRefresh);
      unsubConn = SocketService.onConnect(scheduleRefresh);
    })();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') scheduleRefresh();
    });
    return () => {
      if (unsubMsg) unsubMsg();
      if (unsubRead) unsubRead();
      if (unsubConn) unsubConn();
      appSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, scheduleRefresh]);

  // Just closed a conversation → those messages are now read on the server.
  useEffect(() => {
    if (prevRoute.current === 'ChatRoom' && currentRoute !== 'ChatRoom') scheduleRefresh();
    prevRoute.current = currentRoute;
  }, [currentRoute, scheduleRefresh]);

  return count;
}
