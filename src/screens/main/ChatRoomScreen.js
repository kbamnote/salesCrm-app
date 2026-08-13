import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Image, Modal, Dimensions, Clipboard, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { chatApi, usersApi } from '../../api';
import { photoUri, initialsOf } from '../../utils/avatar';
import LinkedText from '../../components/LinkedText';

// Quick-reaction emojis offered on long-press (same set WhatsApp defaults to).
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
import SocketService from '../../services/location/SocketService';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// How close to the end of the list still counts as "at the bottom" (px).
const BOTTOM_THRESHOLD = 80;
// How close to the top triggers loading the previous page of history (px).
const TOP_THRESHOLD = 60;
// Messages fetched per page — must match what the server treats as "a full
// page" so hasMore is computed correctly (a short final page means the end
// of history has been reached).
const PAGE_SIZE = 50;

// Merge a freshly-fetched "latest window" into what's already loaded, keeping
// any older history the user paginated in (everything before the fresh
// window's oldest message) and letting the fresh batch supersede whatever it
// overlaps with (so edits/reactions/deletes on recent messages still show up).
const mergeFreshWindow = (prev, fresh) => {
  if (!fresh.length) return prev;
  const freshIds = new Set(fresh.map((m) => String(m._id)));
  const oldestFreshTime = new Date(fresh[0].createdAt).getTime();
  const olderHistory = prev.filter((m) => (
    !freshIds.has(String(m._id)) && new Date(m.createdAt).getTime() < oldestFreshTime
  ));
  return [...olderHistory, ...fresh];
};

// A typing event is treated as stale this long after it arrived, so a dropped
// "stopped typing" never leaves the indicator stuck on.
const TYPING_TTL_MS = 4000;

const isSameDay = (a, b) => {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate();
};

// "Today" / "Yesterday" / "12 Aug 2026" for the date separators.
const dayLabel = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (isSameDay(d, now)) return 'Today';
  const yesterday = new Date(now.getTime() - 86400000);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

// "last seen today at 14:05" / "last seen 10 Aug at 09:12".
const lastSeenLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isSameDay(d, new Date())) return `last seen today at ${time}`;
  if (isSameDay(d, new Date(Date.now() - 86400000))) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} at ${time}`;
};

const formatBytes = (n) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const makeChatId = (a, b) => [String(a), String(b)].sort().join('_');

// `opts` carries the real filename/mime for documents ("raw" uploads), where
// guessing image/<ext> would be wrong and would mangle the download name.
const uploadToCloudinary = async (uri, resourceType = 'image', opts = {}) => {
  const formData = new FormData();
  const ext = uri.split('.').pop() || (resourceType === 'video' ? 'm4a' : 'jpg');
  const mimeType = opts.mimeType
    || (resourceType === 'video' ? 'audio/m4a' : `image/${ext}`);
  const name = opts.name || `upload.${ext}`;
  formData.append('file', { uri, type: mimeType, name });
  formData.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`${CLOUDINARY_URL}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
};

export default function ChatRoomScreen({ route, navigation }) {
  const { chatId: paramChatId, toId: paramToId, chatName, groupId: paramGroupId } = route.params || {};
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const myId = String(user?._id || user?.id || '');

  const isGroup = !!(paramGroupId || (paramChatId && !String(paramChatId).includes('_')));
  const groupId = paramGroupId || (isGroup ? paramChatId : null);

  const toId = isGroup ? null : (paramToId ||
    (paramChatId && paramChatId.includes('_')
      ? paramChatId.split('_').find((id) => id !== myId)
      : null));

  const chatId = paramChatId || (groupId ? groupId : (toId && myId ? makeChatId(myId, toId) : null));
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  // WhatsApp-style message actions: long-press a bubble to react / reply / copy.
  const [actionMsg, setActionMsg] = useState(null);   // message the sheet is open for
  const [replyTo, setReplyTo] = useState(null);       // message being replied to
  // @mention autocomplete (groups only).
  const [mentionQuery, setMentionQuery] = useState(null); // null = picker closed
  const mentionedRef = useRef([]);                    // ids @mentioned in the draft
  const flatListRef = useRef(null);
  // Scroll anchoring — the list only jumps to the newest message when the user
  // is already at the bottom. Scrolled up reading history (or coming back from
  // the image preview), their position is left exactly where it was.
  const atBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  // Older-history pagination — scrolling to the top loads the previous page
  // instead of the chat being capped at whatever the first fetch returned.
  const messagesRef = useRef([]);          // always-current mirror of `messages`
  const hasMoreRef = useRef(true);         // more history exists before what's loaded
  const loadingOlderRef = useRef(false);
  const loadedChatIdRef = useRef(null);    // which chat the loaded messages belong to
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef(null);

  const [playingId, setPlayingId] = useState(null);
  const soundRef = useRef(null);

  const [previewImage, setPreviewImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Pinned messages (newest first) + the "all pinned" sheet.
  const [pinnedMsgs, setPinnedMsgs] = useState([]);
  const [showPinList, setShowPinList] = useState(false);
  // Message currently being edited — the composer switches into edit mode.
  const [editing, setEditing] = useState(null);

  // Multi-select (bulk delete / forward).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Forwarding: which messages, and the conversation picker.
  const [forwardMsgs, setForwardMsgs] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwarding, setForwarding] = useState(false);

  // In-chat search.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searching, setSearching] = useState(false);

  // Image picked but not sent yet — the caption sheet is open on it.
  const [pendingImage, setPendingImage] = useState(null);
  const [imageCaption, setImageCaption] = useState('');

  // Presence of the 1:1 peer, and who is currently typing in this chat.
  const [peerPresence, setPeerPresence] = useState(null); // { online, lastSeen }
  const [typingNames, setTypingNames] = useState([]);
  const typingTimersRef = useRef({});
  const myTypingRef = useRef({ sent: false, timer: null });

  // First message I hadn't read when the chat opened — drives the divider.
  const firstUnreadRef = useRef(null);
  const [firstUnreadId, setFirstUnreadId] = useState(null);

  const [displayName, setDisplayName] = useState(chatName || 'Chat');
  const [showMembers, setShowMembers] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null); // populated group: { name, createdBy, members }
  const [membersLoading, setMembersLoading] = useState(false);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Add members
  const [addOpen, setAddOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [addSelected, setAddSelected] = useState([]);
  const [adding, setAdding] = useState(false);

  // Per-member remove spinner
  const [busyMemberId, setBusyMemberId] = useState(null);

  const members = groupInfo?.members || [];
  const adminId = String(groupInfo?.createdBy?._id || groupInfo?.createdBy || '');
  const iAmAdmin = !!groupInfo && (adminId === myId || user?.role === 'admin');

  // Keep the header title in sync (updates live after a rename) and, for groups,
  // show the "people" button that opens the group-info sheet.
  // "typing…" wins over presence, exactly like WhatsApp.
  const headerSubtitle = typingNames.length
    ? (isGroup
      ? `${typingNames.slice(0, 2).join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
      : 'typing…')
    : (!isGroup && peerPresence
      ? (peerPresence.online ? 'online' : lastSeenLabel(peerPresence.lastSeen))
      : '');

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
          {!!headerSubtitle && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
          )}
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
          <TouchableOpacity onPress={() => setSearchOpen((v) => !v)} style={{ marginRight: 14 }}>
            <Ionicons name="search" size={21} color="#fff" />
          </TouchableOpacity>
          {isGroup && groupId && (
            <TouchableOpacity onPress={openGroupInfo}>
              <Ionicons name="people" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [isGroup, groupId, navigation, displayName, headerSubtitle]);

  const loadGroup = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await chatApi.groupDetail(groupId);
      setGroupInfo(res.data);
      if (res.data?.name) setDisplayName(res.data.name);
    } catch (e) {
      console.log('Error loading group', e);
    } finally {
      setMembersLoading(false);
    }
  }, [groupId]);

  const openGroupInfo = () => {
    setShowMembers(true);
    setRenaming(false);
    loadGroup(); // always refresh so name + members are current
  };

  const startRename = () => { setNameDraft(displayName); setRenaming(true); };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name) return Alert.alert('Group name', 'Please enter a name.');
    if (name === displayName) { setRenaming(false); return; }
    setSavingName(true);
    try {
      const res = await chatApi.updateGroup(groupId, { name });
      setGroupInfo(res.data);
      setDisplayName(res.data?.name || name);
      setRenaming(false);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not rename the group.');
    } finally {
      setSavingName(false);
    }
  };

  const removeMember = (m) => {
    Alert.alert('Remove member', `Remove ${m.name} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setBusyMemberId(String(m._id));
        try {
          const res = await chatApi.updateGroup(groupId, { remove: [String(m._id)] });
          setGroupInfo(res.data);
        } catch (e) {
          Alert.alert('Error', e.response?.data?.message || 'Could not remove member.');
        } finally {
          setBusyMemberId(null);
        }
      } },
    ]);
  };

  const openAddMembers = async () => {
    setAddSelected([]);
    setAddOpen(true);
    setContactsLoading(true);
    try {
      const res = await usersApi.contacts();
      const memberIds = new Set(members.map((x) => String(x._id)));
      setContacts((res.data || []).filter((u) => !memberIds.has(String(u._id))));
    } catch (e) {
      console.log('Error loading contacts', e);
    } finally {
      setContactsLoading(false);
    }
  };

  const toggleAdd = (u) => {
    const id = String(u._id);
    setAddSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmAddMembers = async () => {
    if (addSelected.length === 0) return;
    setAdding(true);
    try {
      const res = await chatApi.updateGroup(groupId, { add: addSelected });
      setGroupInfo(res.data);
      setAddOpen(false);
      setAddSelected([]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not add members.');
    } finally {
      setAdding(false);
    }
  };

  const leaveGroup = () => {
    Alert.alert('Exit group', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: async () => {
        try {
          await chatApi.leaveGroup(groupId);
          setShowMembers(false);
          navigation.goBack();
        } catch (e) {
          Alert.alert('Error', e.response?.data?.message || 'Could not exit the group.');
        }
      } },
    ]);
  };

  const deleteGroup = () => {
    Alert.alert('Delete group', 'This deletes the group and all its messages for everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await chatApi.deleteGroup(groupId);
          setShowMembers(false);
          navigation.goBack();
        } catch (e) {
          Alert.alert('Error', e.response?.data?.message || 'Could not delete the group.');
        }
      } },
    ]);
  };

  const loadMessages = useCallback(async () => {
    if (!chatId) { setLoading(false); return; }
    try {
      const res = await chatApi.messages(chatId, { limit: PAGE_SIZE });
      // Response shape: { messages: [...], roster: [...] } for groups; older
      // plain-array responses (1:1) are still handled for backward compatibility.
      const data = res.data || {};
      const msgs = Array.isArray(data) ? data : (data.messages || []);

      // A full page back means there's more history before it; a short page
      // means we've already got everything. Recomputed on every call (including
      // the 15s safety poll) so it self-corrects if messages get deleted.
      const more = msgs.length >= PAGE_SIZE;
      hasMoreRef.current = more;
      setHasMore(more);

      // On first load of THIS chat, replace outright. On a later refresh of the
      // SAME chat (the poll, or a manual reload), merge instead of replacing —
      // otherwise it would wipe out any older history the user paginated in.
      const sameChat = loadedChatIdRef.current === chatId;
      setMessages((prev) => (sameChat ? mergeFreshWindow(prev, msgs) : msgs));
      loadedChatIdRef.current = chatId;

      // The group roster arrives with the messages themselves, so @mention
      // suggestions have names immediately — even before the fuller groupDetail
      // call (used by the group-info sheet) finishes.
      if (Array.isArray(data.roster) && data.roster.length) {
        setGroupInfo((prev) => ({ ...(prev || {}), members: data.roster }));
      }
      // If any incoming message hasn't been read by me yet, mark the chat read
      // so the unread badge clears and the sender sees a "seen" receipt.
      const hasUnread = msgs.some((m) => {
        const senderId = String(m.fromId || '');
        if (!senderId || senderId === myId) return false;
        return !(m.readBy || []).map(String).includes(myId);
      });
      // Remember where my unread run started, once per visit, so the divider
      // stays put even after the chat is marked read a moment later.
      if (firstUnreadRef.current === null) {
        const firstUnread = msgs.find((m) => (
          String(m.fromId) !== myId
          && !(m.readBy || []).map(String).includes(myId)
          && m.read !== true
        ));
        firstUnreadRef.current = firstUnread ? String(firstUnread._id) : '';
        if (firstUnread) setFirstUnreadId(String(firstUnread._id));
      }

      // Opening the chat means this device has the messages → second tick.
      chatApi.markDelivered(chatId).catch(() => {});
      if (hasUnread) chatApi.markRead(chatId).catch(() => {});
    } catch (e) {
      console.log('Error loading messages', e);
    } finally {
      setLoading(false);
    }
  }, [chatId, myId]);

  // Fetch the page of history immediately before what's currently loaded and
  // prepend it. Guarded with refs (not state) so it stays safe to call from
  // the scroll handler, which is intentionally kept referentially stable.
  const loadOlderMessages = useCallback(async () => {
    if (!chatId || loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await chatApi.messages(chatId, { before: oldest.createdAt, limit: PAGE_SIZE });
      const data = res.data || {};
      const older = Array.isArray(data) ? data : (data.messages || []);
      const more = older.length >= PAGE_SIZE;
      hasMoreRef.current = more;
      setHasMore(more);
      if (older.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => String(m._id)));
          const fresh = older.filter((m) => !seen.has(String(m._id)));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      }
    } catch (e) {
      console.log('Error loading older messages', e);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [chatId]);

  // Keep a same-render-cycle mirror of the messages array (for loadOlderMessages,
  // which needs synchronous read access to "the current oldest message" outside
  // of a setState updater) and a stable ref to the latest loadOlderMessages
  // closure (so the scroll handler can call it without needing to be recreated
  // every time the messages array changes).
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const loadOlderRef = useRef(() => {});
  useEffect(() => { loadOlderRef.current = loadOlderMessages; }, [loadOlderMessages]);

  // Reset pagination/scroll bookkeeping whenever the chat itself changes (the
  // screen can be reused across chats — e.g. tapping a different chat's push
  // notification while one is already open — rather than always remounting).
  useEffect(() => {
    setLoading(true);   // hide the previous chat's messages while the new ones load
    hasMoreRef.current = true;
    setHasMore(true);
    didInitialScrollRef.current = false;
    firstUnreadRef.current = null;
    setFirstUnreadId(null);
    atBottomRef.current = true;
    setAtBottom(true);
  }, [chatId]);

  // Append a message if it's not already in the list (dedupe by _id).
  const upsertMessage = useCallback((m) => {
    if (!m || !m._id) return;
    setMessages((prev) => (
      prev.some((x) => String(x._id) === String(m._id)) ? prev : [...prev, m]
    ));
  }, []);

  // Pinned messages — newest pin drives the banner under the header.
  const refreshPinned = useCallback(() => {
    if (!chatId) return;
    chatApi.pinned(chatId).then((r) => setPinnedMsgs(r.data || [])).catch(() => {});
  }, [chatId]);

  // True when at least one other participant has read my message.
  const isSeenByOthers = useCallback((msg) => {
    const readBy = (msg.readBy || []).map(String).filter((id) => id !== myId);
    if (isGroup) return readBy.length > 0;
    if (toId) return readBy.includes(String(toId));
    return msg.read === true;
  }, [isGroup, toId, myId]);

  // True once at least one other participant's device has the message (second tick).
  const isDeliveredToOthers = useCallback((msg) => {
    const to = (msg.deliveredTo || []).map(String).filter((id) => id !== myId);
    if (isGroup) return to.length > 0;
    if (toId) return to.includes(String(toId));
    return to.length > 0;
  }, [isGroup, toId, myId]);

  useEffect(() => {
    loadMessages();
    // Preload the group roster on mount (in parallel with messages) so @mentions
    // are instant — previously the picker had no names until the group-info
    // sheet was opened, which made mentions feel slow to load.
    if (isGroup && groupId) loadGroup();
    refreshPinned();
    // Socket delivers messages in real time; this slow poll is just a safety net
    // for anything missed during a socket drop.
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [loadMessages, isGroup, groupId, loadGroup, refreshPinned]);

  // Real-time: receive new messages + read-receipts over the socket.
  useEffect(() => {
    if (!chatId) return undefined;
    let unsubMsg = null;
    let unsubRead = null;
    let unsubReaction = null;
    let unsubUpdate = null;
    let unsubDelivered = null;
    (async () => {
      await SocketService.connect();
      unsubMsg = SocketService.onChat((m) => {
        if (String(m.chatId) !== String(chatId)) return;
        upsertMessage(m);
        // An incoming message from someone else → mark the chat read so the
        // badge clears and the sender gets a "seen" receipt.
        if (String(m.fromId) !== myId) {
          chatApi.markDelivered(chatId).catch(() => {});
          chatApi.markRead(chatId).catch(() => {});
        }
      });
      unsubRead = SocketService.onChatRead((data) => {
        if (String(data.chatId) !== String(chatId)) return;
        if (String(data.readerId) === myId) return;
        setMessages((prev) => prev.map((m) => {
          if (String(m.fromId) !== myId) return m;
          const readBy = (m.readBy || []).map(String);
          if (readBy.includes(String(data.readerId))) return m;
          return { ...m, readBy: [...readBy, String(data.readerId)], read: true };
        }));
      });
      unsubReaction = SocketService.onChatReaction((data) => {
        if (String(data.chatId) !== String(chatId)) return;
        setMessages((prev) => prev.map((m) =>
          String(m._id) === String(data._id) ? { ...m, reactions: data.reactions } : m));
      });
      // Edited / deleted / pinned — the server sends only the changed fields.
      unsubUpdate = SocketService.onChatUpdate((data) => {
        if (String(data.chatId) !== String(chatId)) return;
        const { _id, chatId: _c, ...patch } = data;
        setMessages((prev) => prev.map((m) =>
          String(m._id) === String(_id) ? { ...m, ...patch } : m));
        if ('pinnedAt' in patch || patch.deleted) refreshPinned();
      });
      unsubDelivered = SocketService.onChatDelivered((data) => {
        if (String(data.chatId) !== String(chatId)) return;
        if (String(data.userId) === myId) return;
        setMessages((prev) => prev.map((m) => {
          if (String(m.fromId) !== myId) return m;
          const to = (m.deliveredTo || []).map(String);
          return to.includes(String(data.userId))
            ? m : { ...m, deliveredTo: [...to, String(data.userId)] };
        }));
      });
    })();
    return () => {
      if (unsubMsg) unsubMsg();
      if (unsubRead) unsubRead();
      if (unsubReaction) unsubReaction();
      if (unsubUpdate) unsubUpdate();
      if (unsubDelivered) unsubDelivered();
    };
  }, [chatId, myId, upsertMessage]);

  // ── Typing indicator ──────────────────────────────────────────────────────
  // Each incoming "typing" refreshes that user's expiry timer; the label clears
  // itself if the "stopped" event never arrives.
  useEffect(() => {
    if (!chatId) return undefined;
    let unsub = null;
    const timers = typingTimersRef.current;
    (async () => {
      await SocketService.connect();
      unsub = SocketService.onTyping(({ chatId: cid, userId, userName, typing }) => {
        if (String(cid) !== String(chatId) || String(userId) === myId) return;
        const name = (userName || 'Someone').split(' ')[0];
        if (timers[userId]) clearTimeout(timers[userId]);
        if (!typing) {
          setTypingNames((prev) => prev.filter((n) => n !== name));
          return;
        }
        setTypingNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
        timers[userId] = setTimeout(() => {
          setTypingNames((prev) => prev.filter((n) => n !== name));
        }, TYPING_TTL_MS);
      });
    })();
    return () => {
      if (unsub) unsub();
      Object.values(timers).forEach(clearTimeout);
      typingTimersRef.current = {};
      // Don't leave the other side seeing a stale "typing…" when I walk away.
      SocketService.emitTyping(chatId, false);
      if (myTypingRef.current.timer) clearTimeout(myTypingRef.current.timer);
      myTypingRef.current = { sent: false, timer: null };
    };
  }, [chatId, myId]);

  // ── Presence (1:1 only) ───────────────────────────────────────────────────
  useEffect(() => {
    if (isGroup || !toId) return undefined;
    let unsub = null;
    const peer = String(toId);
    chatApi.presence([peer])
      .then((r) => {
        const row = (r.data || [])[0];
        if (row) setPeerPresence({ online: row.online, lastSeen: row.lastSeen });
      })
      .catch(() => {});
    (async () => {
      await SocketService.connect();
      unsub = SocketService.onPresence((data) => {
        // Snapshot on connect: a list of everyone currently online.
        if (Array.isArray(data?.online)) {
          setPeerPresence((prev) => ({
            ...(prev || {}), online: data.online.map(String).includes(peer),
          }));
          return;
        }
        if (String(data?.userId) !== peer) return;
        setPeerPresence({ online: !!data.online, lastSeen: data.lastSeen || null });
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [isGroup, toId]);

  // Real-time group changes: if this group is renamed or its members change,
  // refresh; if it's deleted or I'm removed, leave the room (WhatsApp-style).
  useEffect(() => {
    if (!isGroup || !groupId) return undefined;
    let unsub = null;
    (async () => {
      await SocketService.connect();
      unsub = SocketService.onGroup(async (data) => {
        if (String(data?.groupId) !== String(groupId)) return;
        if (data.deleted) {
          Alert.alert('Group deleted', 'This group has been deleted.');
          navigation.goBack();
          return;
        }
        try {
          const res = await chatApi.groupDetail(groupId);
          const stillMember = (res.data?.members || []).some((m) => String(m._id) === myId);
          if (!stillMember) {
            Alert.alert('Removed', 'You are no longer a member of this group.');
            navigation.goBack();
            return;
          }
          setGroupInfo(res.data);
          if (res.data?.name) setDisplayName(res.data.name);
        } catch (e) {
          // groupDetail 403 (removed) or 404 (deleted) → leave the room.
          navigation.goBack();
        }
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [isGroup, groupId, myId, navigation]);

  // Force the list to the newest message (used on first open and after *I*
  // send something — never for background refreshes).
  const scrollToBottom = useCallback((animated = true) => {
    atBottomRef.current = true;
    setAtBottom(true);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 50);
  }, []);

  // Keep track of where the user is. `atBottomRef` is what the scroll logic
  // reads (always current); `atBottom` only drives the jump-to-latest button.
  // Deliberately has no dependencies (reads everything through refs) so it
  // never needs recreating — that's what lets loadOlderRef.current() below
  // always call the freshest loadOlderMessages closure.
  const onListScroll = useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const near = distanceFromBottom <= BOTTOM_THRESHOLD;
    if (near !== atBottomRef.current) {
      atBottomRef.current = near;
      setAtBottom(near);
    }
    // Scrolled near the top, after the initial jump-to-bottom has already
    // happened (otherwise the empty-list starting position would falsely
    // trigger this) → pull in the previous page of history.
    if (didInitialScrollRef.current && contentOffset.y <= TOP_THRESHOLD) {
      loadOlderRef.current?.();
    }
  }, []);

  // Content size changes on every re-render/relayout — including opening and
  // closing the image preview. Only follow it to the bottom if that's where the
  // user already was, otherwise their scroll position is lost.
  const onListContentSizeChange = useCallback(() => {
    if (!didInitialScrollRef.current) {
      if (messages.length > 0) {
        didInitialScrollRef.current = true;
        flatListRef.current?.scrollToEnd({ animated: false });
      }
      return;
    }
    if (atBottomRef.current) flatListRef.current?.scrollToEnd({ animated: false });
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length || !flatListRef.current) return;
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      return;
    }
    // New message while reading history → stay put; the jump-to-latest button
    // is there if they want to catch up.
    if (!atBottomRef.current) return;
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  useEffect(() => {
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
      if (recording) recording.stopAndUnloadAsync().catch(() => {});
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, []);

  const handleSend = async () => {
    if (!text.trim()) return;
    if (editing) return saveEdit();
    const msgText = text.trim();
    const quoted = replyTo;
    // Only keep mentions whose @name still appears in the text the user sent.
    const mentions = mentionedRef.current
      .filter((m) => msgText.includes(`@${m.name}`))
      .map((m) => m.id);
    setText('');
    setReplyTo(null);
    setMentionQuery(null);
    mentionedRef.current = [];
    // Sending ends the typing state immediately.
    if (myTypingRef.current.timer) clearTimeout(myTypingRef.current.timer);
    myTypingRef.current = { sent: false, timer: null };
    SocketService.emitTyping(chatId, false);
    setSending(true);
    try {
      const payload = isGroup ? { groupId, content: msgText } : { toId, content: msgText };
      if (quoted?._id) payload.replyTo = quoted._id;
      if (mentions.length) payload.mentions = mentions;
      const sent = await chatApi.send(payload);
      if (sent?.data) upsertMessage(sent.data); // instant local echo (socket dedupes)
      scrollToBottom(); // my own message always pulls the list down
    } catch (e) {
      const errMsg = e.response?.data?.message || 'Failed to send message.';
      Alert.alert('Error', errMsg);
      setText(msgText);
      setReplyTo(quoted);
    } finally {
      setSending(false);
    }
  };

  // ── Edit / delete / pin ───────────────────────────────────────────────────
  // Both windows are enforced server-side too; this only decides which options
  // the long-press sheet offers.
  const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  const withinWindow = (m) =>
    Date.now() - new Date(m?.createdAt || 0).getTime() <= EDIT_WINDOW_MS;
  const canEdit = (m) =>
    !!m && String(m.fromId) === myId && m.type === 'text' && !m.deleted && withinWindow(m);
  const canDelete = (m) =>
    !!m && String(m.fromId) === myId && !m.deleted && withinWindow(m);

  const startEdit = (m) => {
    setActionMsg(null);
    setReplyTo(null);
    setEditing(m);
    setText(m.content || '');
  };

  const cancelEdit = () => {
    setEditing(null);
    setText('');
  };

  const saveEdit = async () => {
    const target = editing;
    const next = text.trim();
    if (!target || !next) return;
    if (next === target.content) return cancelEdit();
    setSending(true);
    try {
      const res = await chatApi.editMessage(target._id, next);
      const editedAt = res?.data?.editedAt || new Date().toISOString();
      setMessages((prev) => prev.map((m) =>
        String(m._id) === String(target._id) ? { ...m, content: next, editedAt } : m));
      cancelEdit();
      refreshPinned();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not edit the message.');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = (m) => {
    setActionMsg(null);
    Alert.alert(
      'Delete message?',
      'This removes it for everyone in this chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic tombstone — the socket confirms for everyone else.
            setMessages((prev) => prev.map((x) =>
              String(x._id) === String(m._id)
                ? { ...x, deleted: true, content: '', reactions: [], pinnedAt: null }
                : x));
            try {
              await chatApi.deleteMessage(m._id);
              refreshPinned();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not delete the message.');
              loadMessages();
            }
          },
        },
      ],
    );
  };

  const togglePin = async (m) => {
    setActionMsg(null);
    try {
      const res = await chatApi.pinMessage(m._id);
      const patch = res?.data || {};
      setMessages((prev) => prev.map((x) =>
        String(x._id) === String(m._id) ? { ...x, ...patch } : x));
      refreshPinned();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not pin the message.');
    }
  };

  // Tap a pinned message → jump to it in the list.
  const jumpToMessage = (id) => {
    setShowPinList(false);
    const index = messages.findIndex((m) => String(m._id) === String(id));
    if (index < 0) {
      return Alert.alert('Not loaded', 'Scroll up to load older messages, then try again.');
    }
    atBottomRef.current = false;
    setAtBottom(false);
    try {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch (_) { /* out of range — ignore */ }
  };

  // ── Message actions ───────────────────────────────────────────────────────
  const copyMessage = (m) => {
    // RN core Clipboard is deprecation-warned but still functional, and needs no
    // native module — so this ships as a JS-only update.
    Clipboard.setString(String(m?.content || ''));
    setActionMsg(null);
    Alert.alert('Copied', 'Message copied to clipboard.');
  };

  const toggleReaction = async (m, emoji) => {
    setActionMsg(null);
    // Optimistic: reflect it immediately, then let the server/socket confirm.
    setMessages((prev) => prev.map((x) => {
      if (String(x._id) !== String(m._id)) return x;
      const rest = (x.reactions || []).filter((r) => String(r.userId) !== myId);
      const mine = (x.reactions || []).find((r) => String(r.userId) === myId);
      return { ...x, reactions: mine && mine.emoji === emoji ? rest : [...rest, { userId: myId, emoji }] };
    }));
    try {
      const res = await chatApi.react(m._id, emoji);
      if (res?.data) {
        setMessages((prev) => prev.map((x) =>
          String(x._id) === String(res.data._id) ? { ...x, reactions: res.data.reactions } : x));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not add the reaction.');
    }
  };

  // ── @mentions (groups only) ───────────────────────────────────────────────
  // Fire "typing" once, then a "stopped" 2.5s after the last keystroke, so a
  // burst of typing is one event in and one event out — not one per character.
  const signalTyping = () => {
    if (!myTypingRef.current.sent) {
      myTypingRef.current.sent = true;
      SocketService.emitTyping(chatId, true);
    }
    if (myTypingRef.current.timer) clearTimeout(myTypingRef.current.timer);
    myTypingRef.current.timer = setTimeout(() => {
      myTypingRef.current.sent = false;
      SocketService.emitTyping(chatId, false);
    }, 2500);
  };

  const onChangeText = (v) => {
    setText(v);
    signalTyping();
    if (!isGroup) return;
    // Open the picker while typing an @word at the caret (end of the text).
    const m = v.match(/@([\w]*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const applyMention = (u) => {
    const name = u.name || '';
    setText((prev) => prev.replace(/@([\w]*)$/, `@${name} `));
    mentionedRef.current = [
      ...mentionedRef.current.filter((x) => x.id !== String(u._id)),
      { id: String(u._id), name },
    ];
    setMentionQuery(null);
  };

  // Memoized so the filter only runs when the query or the roster actually
  // changes — not on every keystroke / unrelated re-render (keeps the picker
  // as instant as the roster allows).
  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .filter((u) => String(u._id) !== myId)
      .filter((u) => !mentionQuery || (u.name || '').toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, members, myId]);

  // Shared upload+send path for both the gallery and the camera. `caption` is
  // optional text that travels with the photo.
  const sendImageAsset = async (uri, caption = '') => {
    try {
      setUploading(true);
      const url = await uploadToCloudinary(uri, 'image');
      const payload = isGroup
        ? { groupId, content: url, type: 'image' }
        : { toId, content: url, type: 'image' };
      if (caption.trim()) payload.caption = caption.trim();
      await chatApi.send(payload);
      await loadMessages();
      scrollToBottom();
    } catch (e) {
      Alert.alert('Error', 'Could not send image. Please try again.');
      console.log('Image send error', e);
    } finally {
      setUploading(false);
    }
  };

  // Picked a photo → show the caption sheet instead of sending straight away.
  const stageImage = (uri) => {
    setImageCaption('');
    setPendingImage(uri);
  };

  const confirmSendImage = async () => {
    const uri = pendingImage;
    const cap = imageCaption;
    setPendingImage(null);
    setImageCaption('');
    if (uri) await sendImageAsset(uri, cap);
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*', copyToCacheDirectory: true, multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      // Cloudinary stores anything non-media under the "raw" resource type.
      setUploading(true);
      const url = await uploadToCloudinary(file.uri, 'raw', {
        name: file.name, mimeType: file.mimeType || 'application/octet-stream',
      });
      const payload = isGroup
        ? { groupId, content: url, type: 'file' }
        : { toId, content: url, type: 'file' };
      payload.fileName = file.name || 'Document';
      payload.fileSize = file.size || undefined;
      await chatApi.send(payload);
      await loadMessages();
      scrollToBottom();
    } catch (e) {
      Alert.alert('Error', 'Could not send the document. Please try again.');
      console.log('Document send error', e);
    } finally {
      setUploading(false);
    }
  };

  const openDocument = (m) => {
    Linking.openURL(m.content).catch(() =>
      Alert.alert('Error', 'No app on this phone can open that file.'));
  };

  // ── Multi-select ──────────────────────────────────────────────────────────
  const enterSelect = (m) => {
    setActionMsg(null);
    setSelectMode(true);
    setSelectedIds([String(m._id)]);
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const toggleSelect = (m) => {
    const id = String(m._id);
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) setSelectMode(false);
      return next;
    });
  };

  const selectedMessages = () =>
    messages.filter((m) => selectedIds.includes(String(m._id)));

  const bulkDelete = () => {
    const ids = [...selectedIds];
    Alert.alert(
      `Delete ${ids.length} message${ids.length > 1 ? 's' : ''}?`,
      'Messages you sent in the last 24 hours are removed for everyone. Anything else is skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            exitSelect();
            try {
              const res = await chatApi.bulkDelete(ids);
              const done = (res.data?.deleted || []).map(String);
              setMessages((prev) => prev.map((m) => (
                done.includes(String(m._id))
                  ? { ...m, deleted: true, content: '', caption: '', reactions: [], pinnedAt: null }
                  : m)));
              refreshPinned();
              const skipped = (res.data?.skipped || []).length;
              if (skipped) {
                Alert.alert('Partly deleted', `${skipped} message(s) were older than 24 hours or not yours.`);
              }
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not delete the messages.');
              loadMessages();
            }
          },
        },
      ],
    );
  };

  // ── Forward ───────────────────────────────────────────────────────────────
  const openForward = async (msgs) => {
    setActionMsg(null);
    setForwardMsgs(msgs);
    try {
      const [convRes, groupRes, contactRes] = await Promise.all([
        chatApi.conversations(),
        chatApi.groups(),
        usersApi.contacts(),
      ]);
      // Everything you can forward to: existing chats first, then any colleague.
      const seen = new Set();
      const targets = [];
      (convRes.data || []).forEach((c) => {
        const id = String(c._id);
        if (id === String(chatId) || seen.has(id)) return;
        seen.add(id);
        const last = c.last || {};
        targets.push(last.groupId
          ? { key: id, label: last.groupName || 'Group', groupId: String(last.groupId) }
          : {
            key: id,
            label: String(last.fromId) === myId ? (last.toName || last.fromName) : last.fromName,
            toId: id.split('_').find((x) => x !== myId),
          });
      });
      (groupRes.data || []).forEach((g) => {
        const id = String(g._id);
        if (id === String(chatId) || seen.has(id)) return;
        seen.add(id);
        targets.push({ key: id, label: g.name, groupId: id });
      });
      (contactRes.data || []).forEach((u) => {
        const uid = String(u._id);
        if (uid === myId) return;
        const key = [myId, uid].sort().join('_');
        if (key === String(chatId) || seen.has(key)) return;
        seen.add(key);
        targets.push({ key, label: u.name, toId: uid });
      });
      setForwardTargets(targets);
    } catch (e) {
      setForwardTargets([]);
    }
  };

  const doForward = async (target) => {
    if (!forwardMsgs?.length) return;
    setForwarding(true);
    try {
      // Oldest first, so the order is preserved in the destination chat.
      const ordered = [...forwardMsgs].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      for (const m of ordered) {
        const payload = target.groupId ? { groupId: target.groupId } : { toId: target.toId };
        payload.type = m.type || 'text';
        payload.content = m.content;
        payload.forwarded = true;
        if (m.caption) payload.caption = m.caption;
        if (m.fileName) payload.fileName = m.fileName;
        if (m.fileSize) payload.fileSize = m.fileSize;
        if (m.duration) payload.duration = m.duration;
        await chatApi.send(payload);
      }
      setForwardMsgs(null);
      exitSelect();
      Alert.alert('Forwarded', `Sent to ${target.label}.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not forward the message.');
    } finally {
      setForwarding(false);
    }
  };

  // ── In-chat search ────────────────────────────────────────────────────────
  const runSearch = async (q) => {
    setSearchQ(q);
    if (q.trim().length < 2) { setSearchHits([]); return; }
    setSearching(true);
    try {
      const res = await chatApi.search(q.trim(), chatId);
      setSearchHits(res.data || []);
    } catch (e) {
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQ('');
    setSearchHits([]);
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission needed', 'Please allow access to your photo library.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      stageImage(result.assets[0].uri);
    } catch (e) {
      Alert.alert('Error', 'Could not open the photo library.');
      console.log('Gallery error', e);
    }
  };

  // Shoot a photo and send it without leaving the chat.
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission needed', 'Please allow camera access to take photos.');
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      stageImage(result.assets[0].uri);
    } catch (e) {
      Alert.alert('Error', 'Could not open the camera.');
      console.log('Camera error', e);
    }
  };

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert('Permission needed', 'Please allow microphone access to record voice notes.');
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimer.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (e) {
      Alert.alert('Error', 'Could not start recording.');
      console.log('Recording start error', e);
    }
  };

  const cancelRecording = async () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    setIsRecording(false);
    setRecordingDuration(0);
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch (_) {}
      setRecording(null);
    }
  };

  const stopAndSendRecording = async () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    const duration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;
      setUploading(true);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const url = await uploadToCloudinary(uri, 'video');
      const payload = isGroup
        ? { groupId, content: url, type: 'voice' }
        : { toId, content: url, type: 'voice' };
      payload.duration = duration;
      await chatApi.send(payload);
      await loadMessages();
      scrollToBottom();
    } catch (e) {
      Alert.alert('Error', 'Could not send voice note. Please try again.');
      console.log('Voice send error', e);
    } finally {
      setUploading(false);
    }
  };

  const playVoice = async (url, msgId) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingId === msgId) {
        setPlayingId(null);
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      soundRef.current = sound;
      setPlayingId(msgId);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
      await sound.playAsync();
    } catch (e) {
      console.log('Play error', e);
      setPlayingId(null);
    }
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isMyMessage = (msg) => {
    if (!user) return false;
    const senderId = String(msg.fromId || msg.sender?._id || msg.sender || '');
    return senderId === myId;
  };

  // One-line summary of a message, for the pin banner / pin list.
  const previewOf = (m) => {
    if (!m) return '';
    if (m.deleted) return 'This message was deleted';
    if (m.type === 'image') return m.caption ? `📷 ${m.caption}` : '📷 Photo';
    if (m.type === 'voice') return '🎤 Voice note';
    if (m.type === 'file') return `📎 ${m.fileName || 'Document'}`;
    return m.content || '';
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageContent = (item, isMine) => {
    const msgType = item.type || 'text';

    // Deleted-for-everyone tombstone — the row stays so the list doesn't jump.
    if (item.deleted) {
      return (
        <View style={styles.deletedRow}>
          <Ionicons
            name="ban-outline"
            size={14}
            color={isMine ? 'rgba(255,255,255,0.75)' : Theme.colors.textSecondary}
          />
          <Text style={[styles.deletedText, isMine && styles.deletedTextMine]}>
            This message was deleted
          </Text>
        </View>
      );
    }

    if (msgType === 'image') {
      return (
        <View>
          <TouchableOpacity onPress={() => setPreviewImage(item.content)} activeOpacity={0.8}>
            <Image
              source={{ uri: item.content }}
              style={styles.imageMsg}
              resizeMode="cover"
            />
          </TouchableOpacity>
          {!!item.caption && (
            <LinkedText
              style={[styles.bubbleText, styles.captionText, isMine && styles.bubbleTextMine]}
              linkStyle={isMine ? styles.linkMine : styles.link}
            >
              {item.caption}
            </LinkedText>
          )}
        </View>
      );
    }

    if (msgType === 'file') {
      return (
        <TouchableOpacity style={styles.fileMsg} onPress={() => openDocument(item)} activeOpacity={0.7}>
          <View style={[styles.fileIcon, isMine && styles.fileIconMine]}>
            <Ionicons
              name="document-text-outline"
              size={22}
              color={isMine ? '#fff' : Theme.colors.primary}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.fileName, isMine && styles.bubbleTextMine]} numberOfLines={2}>
              {item.fileName || 'Document'}
            </Text>
            {!!item.fileSize && (
              <Text style={[styles.fileSize, isMine && styles.bubbleTimeMine]}>
                {formatBytes(item.fileSize)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    if (msgType === 'voice') {
      const msgId = item._id || item.content;
      const isPlaying = playingId === msgId;
      return (
        <TouchableOpacity
          style={styles.voiceMsg}
          onPress={() => playVoice(item.content, msgId)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={22}
            color={isMine ? '#fff' : Theme.colors.primary}
          />
          <View style={styles.voiceWave}>
            {[...Array(12)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: 6 + Math.random() * 14,
                    backgroundColor: isMine ? 'rgba(255,255,255,0.6)' : 'rgba(99,102,241,0.4)',
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.voiceDuration, isMine && { color: 'rgba(255,255,255,0.8)' }]}>
            {formatDuration(item.duration || 0)}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <LinkedText
        style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
        linkStyle={isMine ? styles.linkMine : styles.link}
      >
        {item.content}
      </LinkedText>
    );
  };

  const renderMessage = ({ item, index }) => {
    const isMine = isMyMessage(item);
    const prevMsg = messages[index - 1];
    const showSender = !isMine && (!prevMsg || String(prevMsg.fromId) !== String(item.fromId));

    const quoted = item.replyTo && typeof item.replyTo === 'object' ? item.replyTo : null;
    // Collapse reactions to "emoji xN" pairs, like WhatsApp.
    const reactionCounts = (item.reactions || []).reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {});
    const reactionList = Object.entries(reactionCounts);

    // Day changed since the previous message → date chip.
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, item.createdAt);
    // First message that was unread when this chat was opened.
    const showUnread = !!firstUnreadId && String(item._id) === String(firstUnreadId);
    const isSelected = selectedIds.includes(String(item._id));

    // Dragging a bubble sideways quotes it, like WhatsApp.
    const renderReplyHint = () => (
      <View style={styles.swipeHint}>
        <Ionicons name="arrow-undo" size={18} color={Theme.colors.primary} />
      </View>
    );

    const bubble = (
      <View style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}>
        {showSender && (
          <Text style={styles.senderName}>{item.fromName || 'Unknown'}</Text>
        )}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => (selectMode ? toggleSelect(item) : null)}
          onLongPress={() => (selectMode ? toggleSelect(item) : setActionMsg(item))}
          delayLongPress={250}
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleOther,
            (item.type === 'image') && styles.imageBubble,
          ]}
        >
          {item.forwarded && (
            <View style={styles.forwardTag}>
              <Ionicons
                name="arrow-redo-outline"
                size={12}
                color={isMine ? 'rgba(255,255,255,0.8)' : Theme.colors.textSecondary}
              />
              <Text style={[styles.forwardTagText, isMine && styles.bubbleTimeMine]}>Forwarded</Text>
            </View>
          )}
          {quoted && (
            <View style={[styles.quoteBox, isMine && styles.quoteBoxMine]}>
              <Text style={[styles.quoteName, isMine && { color: '#fff' }]} numberOfLines={1}>
                {quoted.fromName || 'Message'}
              </Text>
              <Text style={[styles.quoteText, isMine && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>
                {previewOf(quoted)}
              </Text>
            </View>
          )}
          {renderMessageContent(item, isMine)}
          <View style={styles.metaRow}>
            {!!item.pinnedAt && (
              <Ionicons
                name="pin"
                size={11}
                color={isMine ? 'rgba(255,255,255,0.8)' : Theme.colors.textSecondary}
                style={{ marginRight: 4 }}
              />
            )}
            {!!item.editedAt && !item.deleted && (
              <Text style={[styles.editedTag, isMine && styles.bubbleTimeMine]}>Edited</Text>
            )}
            <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
              {formatTime(item.createdAt)}
            </Text>
            {isMine && !item.deleted && (
              // One tick = sent, two grey = delivered, two blue = read.
              <Ionicons
                name={isDeliveredToOthers(item) || isSeenByOthers(item) ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={isSeenByOthers(item) ? '#8FE3FF' : 'rgba(255,255,255,0.7)'}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </TouchableOpacity>

        {reactionList.length > 0 && (
          <View style={[styles.reactionRow, isMine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
            {reactionList.map(([emoji, count]) => (
              <TouchableOpacity key={emoji} style={styles.reactionPill} onPress={() => toggleReaction(item, emoji)}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );

    return (
      <View>
        {showDate && (
          <View style={styles.dayChipRow}>
            <Text style={styles.dayChip}>{dayLabel(item.createdAt)}</Text>
          </View>
        )}
        {showUnread && (
          <View style={styles.unreadDivider}>
            <View style={styles.unreadLine} />
            <Text style={styles.unreadLabel}>Unread messages</Text>
            <View style={styles.unreadLine} />
          </View>
        )}
        {selectMode ? (
          // Swiping is disabled while selecting so the two gestures can't fight.
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toggleSelect(item)}
            style={[styles.selectRow, isSelected && styles.selectRowActive]}
          >
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isSelected ? Theme.colors.primary : Theme.colors.border}
              style={{ marginTop: 10 }}
            />
            <View style={{ flex: 1 }}>{bubble}</View>
          </TouchableOpacity>
        ) : (
          <Swipeable
            friction={2}
            leftThreshold={40}
            rightThreshold={40}
            renderLeftActions={renderReplyHint}
            renderRightActions={renderReplyHint}
            onSwipeableOpen={(direction, swipeable) => {
              if (!item.deleted) setReplyTo(item);
              swipeable?.close();
            }}
          >
            {bubble}
          </Swipeable>
        )}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      {/* Selection bar — replaces the header actions while picking messages. */}
      {selectMode && (
        <View style={styles.selectBar}>
          <TouchableOpacity onPress={exitSelect} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.selectCount}>{selectedIds.length} selected</Text>
          <TouchableOpacity
            onPress={() => openForward(selectedMessages())}
            style={{ marginRight: 18 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-redo-outline" size={22} color={Theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={bulkDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* In-chat search */}
      {searchOpen && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search in this chat"
              placeholderTextColor={Theme.colors.textSecondary}
              value={searchQ}
              onChangeText={runSearch}
              autoFocus
              returnKeyType="search"
            />
            {searching
              ? <ActivityIndicator size="small" color={Theme.colors.primary} />
              : (
                <TouchableOpacity onPress={closeSearch}>
                  <Ionicons name="close" size={18} color={Theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
          </View>
          {searchQ.trim().length >= 2 && (
            <FlatList
              data={searchHits}
              keyExtractor={(m) => String(m._id)}
              style={{ maxHeight: 220 }}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.memberSep} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchHit}
                  onPress={() => { closeSearch(); jumpToMessage(item._id); }}
                >
                  <Text style={styles.searchHitName}>
                    {item.fromName || 'Unknown'} · {dayLabel(item.createdAt)}
                  </Text>
                  <Text style={styles.pinPreview} numberOfLines={2}>{previewOf(item)}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !searching ? <Text style={styles.membersEmpty}>No matches</Text> : null
              }
            />
          )}
        </View>
      )}

      {/* Pinned banner — shows the newest pin; tap to jump, long-press to unpin. */}
      {pinnedMsgs.length > 0 && (
        <TouchableOpacity
          style={styles.pinBanner}
          activeOpacity={0.8}
          onPress={() => (pinnedMsgs.length > 1 ? setShowPinList(true) : jumpToMessage(pinnedMsgs[0]._id))}
          onLongPress={() => togglePin(pinnedMsgs[0])}
        >
          <Ionicons name="pin" size={16} color={Theme.colors.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.pinLabel}>
              {pinnedMsgs.length > 1 ? `${pinnedMsgs.length} pinned messages` : 'Pinned message'}
            </Text>
            <Text style={styles.pinPreview} numberOfLines={1}>
              {previewOf(pinnedMsgs[0])}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
      )}

      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={56} color={Theme.colors.border} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubText}>Send a message to start the conversation</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, i) => item._id || String(i)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={onListContentSizeChange}
            onScroll={onListScroll}
            scrollEventThrottle={16}
            // Prepending older messages must not shift what's on screen —
            // this keeps whatever the user is currently looking at anchored
            // in place while the earlier page is inserted above it.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={styles.loadOlderRow}>
                  <ActivityIndicator size="small" color={Theme.colors.primary} />
                  <Text style={styles.loadOlderText}>Loading earlier messages…</Text>
                </View>
              ) : (!hasMore && messages.length > 0 ? (
                <Text style={styles.chatStartText}>This is the start of the conversation</Text>
              ) : null)
            }
            // Jumping to a pinned message that hasn't been measured yet: land
            // close, then let the list settle rather than throwing.
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              flatListRef.current?.scrollToOffset({
                offset: index * (averageItemLength || 80), animated: true,
              });
            }}
          />
          {!atBottom && (
            <TouchableOpacity
              style={styles.jumpLatest}
              onPress={() => scrollToBottom(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-down" size={22} color={Theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={Theme.colors.primary} />
          <Text style={styles.uploadingText}>Sending...</Text>
        </View>
      )}

      {/* @mention suggestions (groups only) */}
      {mentionOptions.length > 0 && (
        <View style={styles.mentionBar}>
          {mentionOptions.map((u) => (
            <TouchableOpacity key={String(u._id)} style={styles.mentionRow} onPress={() => applyMention(u)}>
              <View style={styles.mentionAvatar}>
                {photoUri(u.avatar)
                  ? <Image source={{ uri: photoUri(u.avatar) }} style={styles.mentionAvatarImg} />
                  : <Text style={styles.mentionAvatarText}>{initialsOf(u.name)}</Text>}
              </View>
              <Text style={styles.mentionName}>{u.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Editing an earlier message */}
      {editing && (
        <View style={styles.replyBar}>
          <View style={[styles.replyStripe, { backgroundColor: '#F59E0B' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyName} numberOfLines={1}>Editing message</Text>
            <Text style={styles.replyText} numberOfLines={1}>{editing.content || ''}</Text>
          </View>
          <TouchableOpacity onPress={cancelEdit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Replying-to preview */}
      {replyTo && !editing && (
        <View style={styles.replyBar}>
          <View style={styles.replyStripe} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyName} numberOfLines={1}>
              Replying to {isMyMessage(replyTo) ? 'yourself' : (replyTo.fromName || 'message')}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {previewOf(replyTo)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {isRecording ? (
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
          </View>
          <TouchableOpacity style={styles.sendRecordBtn} onPress={stopAndSendRecording}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity style={styles.attachBtn} onPress={pickImage} disabled={uploading || !!editing}>
            <Ionicons name="image-outline" size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={takePhoto} disabled={uploading || !!editing}>
            <Ionicons name="camera-outline" size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickDocument} disabled={uploading || !!editing}>
            <Ionicons name="attach-outline" size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder={editing ? 'Edit your message...' : 'Type a message...'}
            placeholderTextColor={Theme.colors.textSecondary}
            value={text}
            onChangeText={onChangeText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          {text.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={editing ? 'checkmark' : 'send'} size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.micBtn}
              onPress={startRecording}
              disabled={uploading || !!editing}
            >
              <Ionicons name="mic" size={24} color={Theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Group info + admin controls */}
      <Modal visible={showMembers} transparent animationType="slide" onRequestClose={() => setShowMembers(false)}>
        <View style={styles.membersOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Group Info</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>

            {membersLoading && !groupInfo ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginTop: 30, marginBottom: 30 }} />
            ) : (
              <>
                {/* Group name (editable by admin) */}
                <View style={styles.nameRow}>
                  {renaming ? (
                    <>
                      <TextInput
                        style={styles.nameInput}
                        value={nameDraft}
                        onChangeText={setNameDraft}
                        autoFocus
                        placeholder="Group name"
                        placeholderTextColor={Theme.colors.textSecondary}
                        editable={!savingName}
                        maxLength={60}
                      />
                      <TouchableOpacity onPress={saveName} disabled={savingName} style={styles.nameIconBtn}>
                        {savingName
                          ? <ActivityIndicator size="small" color={Theme.colors.primary} />
                          : <Ionicons name="checkmark" size={22} color={Theme.colors.primary} />}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setRenaming(false)} disabled={savingName} style={styles.nameIconBtn}>
                        <Ionicons name="close" size={20} color={Theme.colors.textSecondary} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.groupNameText} numberOfLines={1}>{displayName}</Text>
                      {iAmAdmin && (
                        <TouchableOpacity onPress={startRename} style={styles.nameIconBtn}>
                          <Ionicons name="pencil" size={18} color={Theme.colors.primary} />
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

                {/* Members header + Add */}
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </Text>
                  {iAmAdmin && (
                    <TouchableOpacity style={styles.addMembersBtn} onPress={openAddMembers}>
                      <Ionicons name="person-add" size={16} color={Theme.colors.primary} />
                      <Text style={styles.addMembersText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <FlatList
                  data={members}
                  keyExtractor={(item) => String(item._id)}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => {
                    const isMe = String(item._id) === myId;
                    const memberIsAdmin = String(item._id) === adminId;
                    const canRemove = iAmAdmin && !memberIsAdmin && !isMe;
                    return (
                      <View style={styles.memberRow}>
                        <View style={styles.memberAvatar}>
                          {photoUri(item.avatar) ? (
                            <Image source={{ uri: photoUri(item.avatar) }} style={styles.memberAvatarImage} />
                          ) : (
                            <Text style={styles.memberAvatarText}>{initialsOf(item.name)}</Text>
                          )}
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>
                            {item.name}{isMe ? ' (You)' : ''}
                          </Text>
                          {item.role ? <Text style={styles.memberRole}>{item.role}</Text> : null}
                        </View>
                        {memberIsAdmin && <Text style={styles.adminBadge}>Admin</Text>}
                        {canRemove && (
                          <TouchableOpacity
                            onPress={() => removeMember(item)}
                            disabled={busyMemberId === String(item._id)}
                            style={styles.removeBtn}
                          >
                            {busyMemberId === String(item._id)
                              ? <ActivityIndicator size="small" color="#EF4444" />
                              : <Ionicons name="remove-circle" size={22} color="#EF4444" />}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={styles.memberSep} />}
                  ListEmptyComponent={<Text style={styles.membersEmpty}>No members found</Text>}
                />

                {/* Footer actions */}
                <View style={styles.groupActions}>
                  <TouchableOpacity style={styles.leaveBtn} onPress={leaveGroup}>
                    <Ionicons name="exit-outline" size={18} color="#EF4444" />
                    <Text style={styles.leaveText}>Exit group</Text>
                  </TouchableOpacity>
                  {iAmAdmin && (
                    <TouchableOpacity style={styles.deleteGroupBtn} onPress={deleteGroup}>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={styles.deleteGroupText}>Delete group</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add members picker (admin) */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.membersOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Add Members</Text>
              <TouchableOpacity onPress={() => setAddOpen(false)} disabled={adding}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            {contactsLoading ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginTop: 30, marginBottom: 30 }} />
            ) : (
              <FlatList
                data={contacts}
                keyExtractor={(item) => String(item._id)}
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => {
                  const sel = addSelected.includes(String(item._id));
                  return (
                    <TouchableOpacity style={styles.memberRow} onPress={() => toggleAdd(item)}>
                      <View style={[styles.checkbox, sel && styles.checkboxActive]}>
                        {sel && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                      <View style={styles.memberAvatar}>
                        {photoUri(item.avatar) ? (
                          <Image source={{ uri: photoUri(item.avatar) }} style={styles.memberAvatarImage} />
                        ) : (
                          <Text style={styles.memberAvatarText}>{initialsOf(item.name)}</Text>
                        )}
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{item.name}</Text>
                        {item.role ? <Text style={styles.memberRole}>{item.role}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.memberSep} />}
                ListEmptyComponent={<Text style={styles.membersEmpty}>Everyone is already in this group</Text>}
              />
            )}
            <TouchableOpacity
              style={[styles.addConfirmBtn, (addSelected.length === 0 || adding) && styles.addConfirmDisabled]}
              onPress={confirmAddMembers}
              disabled={addSelected.length === 0 || adding}
            >
              {adding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.addConfirmText}>Add{addSelected.length ? ` (${addSelected.length})` : ''}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-screen image preview */}
      {/* Long-press message actions: react / reply / copy */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setActionMsg(null)}>
          <View style={styles.actionSheet}>
            <View style={styles.emojiRow}>
              {QUICK_REACTIONS.map((e) => {
                const mine = (actionMsg?.reactions || []).find((r) => String(r.userId) === myId);
                return (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiBtn, mine?.emoji === e && styles.emojiBtnActive]}
                    onPress={() => toggleReaction(actionMsg, e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyTo(actionMsg); setActionMsg(null); }}>
              <Ionicons name="arrow-undo-outline" size={20} color={Theme.colors.text} />
              <Text style={styles.actionLabel}>Reply</Text>
            </TouchableOpacity>
            {actionMsg?.type !== 'image' && actionMsg?.type !== 'voice' && !actionMsg?.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => copyMessage(actionMsg)}>
                <Ionicons name="copy-outline" size={20} color={Theme.colors.text} />
                <Text style={styles.actionLabel}>Copy</Text>
              </TouchableOpacity>
            )}
            {!actionMsg?.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => openForward([actionMsg])}>
                <Ionicons name="arrow-redo-outline" size={20} color={Theme.colors.text} />
                <Text style={styles.actionLabel}>Forward</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionItem} onPress={() => enterSelect(actionMsg)}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Theme.colors.text} />
              <Text style={styles.actionLabel}>Select</Text>
            </TouchableOpacity>
            {!actionMsg?.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => togglePin(actionMsg)}>
                <Ionicons
                  name={actionMsg?.pinnedAt ? 'pin' : 'pin-outline'}
                  size={20}
                  color={Theme.colors.text}
                />
                <Text style={styles.actionLabel}>{actionMsg?.pinnedAt ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
            )}
            {canEdit(actionMsg) && (
              <TouchableOpacity style={styles.actionItem} onPress={() => startEdit(actionMsg)}>
                <Ionicons name="create-outline" size={20} color={Theme.colors.text} />
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>
            )}
            {canDelete(actionMsg) && (
              <TouchableOpacity style={styles.actionItem} onPress={() => deleteMessage(actionMsg)}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Delete for everyone</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward to another chat */}
      <Modal
        visible={!!forwardMsgs}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardMsgs(null)}
      >
        <View style={styles.membersOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>
                Forward {forwardMsgs?.length > 1 ? `${forwardMsgs.length} messages` : 'message'}
              </Text>
              <TouchableOpacity onPress={() => setForwardMsgs(null)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            {forwarding ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={forwardTargets}
                keyExtractor={(t) => t.key}
                style={{ maxHeight: 380 }}
                ItemSeparatorComponent={() => <View style={styles.memberSep} />}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.pinRow} onPress={() => doForward(item)}>
                    <View style={styles.mentionAvatar}>
                      <Text style={styles.mentionAvatarText}>{initialsOf(item.label)}</Text>
                    </View>
                    <Text style={[styles.pinRowName, { marginLeft: 10, flex: 1 }]} numberOfLines={1}>
                      {item.label || 'Unknown'}
                    </Text>
                    <Ionicons name="send" size={18} color={Theme.colors.primary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.membersEmpty}>No other chats yet</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Caption sheet for a photo that hasn't been sent yet */}
      <Modal
        visible={!!pendingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingImage(null)}
      >
        <View style={styles.captionOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPendingImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {!!pendingImage && (
            <Image source={{ uri: pendingImage }} style={styles.captionImage} resizeMode="contain" />
          )}
          <View style={[styles.captionBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={imageCaption}
              onChangeText={setImageCaption}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={confirmSendImage}>
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* All pinned messages */}
      <Modal
        visible={showPinList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinList(false)}
      >
        <View style={styles.membersOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Pinned messages</Text>
              <TouchableOpacity onPress={() => setShowPinList(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pinnedMsgs}
              keyExtractor={(m) => String(m._id)}
              style={{ maxHeight: 340 }}
              ItemSeparatorComponent={() => <View style={styles.memberSep} />}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pinRow} onPress={() => jumpToMessage(item._id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pinRowName}>{item.fromName || 'Unknown'}</Text>
                    <Text style={styles.pinPreview} numberOfLines={2}>{previewOf(item)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => togglePin(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={Theme.colors.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.membersEmpty}>Nothing pinned yet</Text>}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  emptySubText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  listWrap: { flex: 1 },
  loadOlderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loadOlderText: {
    marginLeft: 8,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  chatStartText: {
    textAlign: 'center',
    paddingVertical: 12,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  headerTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: '700',
    color: '#fff',
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  headerSubtitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  // Day chip / unread divider
  dayChipRow: { alignItems: 'center', marginVertical: 10 },
  dayChip: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  unreadDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  unreadLine: { flex: 1, height: 1, backgroundColor: '#EF4444', opacity: 0.35 },
  unreadLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontWeight: '700',
    color: '#EF4444',
    marginHorizontal: 8,
  },
  // Swipe-to-reply
  swipeHint: { justifyContent: 'center', paddingHorizontal: 18 },
  // Multi-select
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.m,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  selectCount: {
    flex: 1,
    marginLeft: 14,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  selectRow: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 6 },
  selectRowActive: { backgroundColor: 'rgba(99,102,241,0.08)' },
  // Search
  searchWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.m,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 8,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    padding: 0,
  },
  searchHit: { paddingVertical: 10 },
  searchHitName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  // Forwarded tag / captions / documents
  forwardTag: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  forwardTagText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontStyle: 'italic',
    color: Theme.colors.textSecondary,
    marginLeft: 3,
  },
  captionText: { marginTop: 6 },
  captionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  captionImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  captionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Theme.spacing.m,
    paddingTop: 10,
  },
  captionInput: {
    flex: 1,
    maxHeight: 100,
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
  },
  fileMsg: { flexDirection: 'row', alignItems: 'center', minWidth: 180 },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  fileIconMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  fileName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  fileSize: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
  },
  pinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.m,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  pinLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  pinPreview: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  pinRowName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  deletedRow: { flexDirection: 'row', alignItems: 'center' },
  deletedText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontStyle: 'italic',
    color: Theme.colors.textSecondary,
    marginLeft: 5,
  },
  deletedTextMine: { color: 'rgba(255,255,255,0.8)' },
  editedTag: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    color: Theme.colors.textSecondary,
    marginRight: 5,
  },
  messagesList: {
    paddingVertical: Theme.spacing.m,
    paddingHorizontal: Theme.spacing.m,
  },
  jumpLatest: {
    position: 'absolute',
    right: Theme.spacing.m,
    bottom: Theme.spacing.m,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  msgWrapper: { marginBottom: 4, maxWidth: '80%' },
  msgRight: { alignSelf: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start' },
  senderName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    marginBottom: 2,
    marginLeft: 12,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '100%',
  },
  bubbleMine: {
    backgroundColor: Theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  imageBubble: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  bubbleText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    lineHeight: 22,
  },
  bubbleTextMine: { color: '#fff' },
  // Links: underlined, and tinted so they stay legible on either bubble colour.
  link: { color: '#1D4ED8', textDecorationLine: 'underline' },
  linkMine: { color: '#fff', textDecorationLine: 'underline', fontWeight: '700' },

  // Quoted reply shown inside a bubble
  quoteBox: { borderLeftWidth: 3, borderLeftColor: Theme.colors.primary, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteBoxMine: { borderLeftColor: '#fff', backgroundColor: 'rgba(255,255,255,0.18)' },
  quoteName: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '800', color: Theme.colors.primary },
  quoteText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },

  // Reaction pills under a bubble
  reactionRow: { flexDirection: 'row', gap: 4, marginTop: -6, marginHorizontal: 4 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Theme.colors.border, elevation: 1 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '700', color: Theme.colors.textSecondary },

  // Long-press action sheet
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14, paddingBottom: 28 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingBottom: 12 },
  emojiBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  emojiBtnActive: { backgroundColor: Theme.colors.primary + '22' },
  emojiText: { fontSize: 26 },
  actionDivider: { height: 1, backgroundColor: Theme.colors.border },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 15 },
  actionLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 15, color: Theme.colors.text, fontWeight: '600' },

  // Reply preview above the input
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Theme.colors.border },
  replyStripe: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: Theme.colors.primary },
  replyName: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', color: Theme.colors.primary },
  replyText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },

  // @mention picker
  mentionBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Theme.colors.border, maxHeight: 220 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  mentionAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Theme.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mentionAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  mentionAvatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '800', color: '#fff' },
  mentionName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '600', color: Theme.colors.text },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  bubbleTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    color: Theme.colors.textSecondary,
    textAlign: 'right',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  imageMsg: {
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    borderRadius: 14,
  },
  voiceMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 160,
  },
  voiceWave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  waveBar: { width: 3, borderRadius: 2 },
  voiceDuration: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: Theme.spacing.s,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    gap: 6,
  },
  attachBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Theme.colors.textSecondary },
  micBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelRecordBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: '#EF4444',
  },
  sendRecordBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
  },
  uploadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.primary,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  membersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  membersSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  membersTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  memberAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  memberAvatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  memberRole: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  memberSep: {
    height: 1,
    backgroundColor: Theme.colors.border,
    marginLeft: 74,
  },
  membersEmpty: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 30,
  },
  // ── Group info: name row ──
  nameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Theme.colors.border,
  },
  groupNameText: {
    flex: 1, fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  nameInput: {
    flex: 1, fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    borderBottomWidth: 2, borderBottomColor: Theme.colors.primary,
    paddingVertical: 4, paddingHorizontal: 2,
  },
  nameIconBtn: { padding: 8, marginLeft: 4 },
  // ── Members section header ──
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
  },
  sectionLabel: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  addMembersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Theme.colors.primary + '15',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  addMembersText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 13,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.primary,
  },
  adminBadge: {
    fontFamily: Theme.typography.fontFamily, fontSize: 11,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '15',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },
  removeBtn: { padding: 6, marginLeft: 6 },
  // ── Add-members checkbox ──
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Theme.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  checkboxActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  // ── Footer actions ──
  groupActions: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
    borderTopWidth: 1, borderTopColor: Theme.colors.border,
  },
  leaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#EF4444',
  },
  leaveText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold, color: '#EF4444',
  },
  deleteGroupBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, backgroundColor: '#EF4444',
  },
  deleteGroupText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold, color: '#fff',
  },
  // ── Add-members confirm ──
  addConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Theme.colors.primary, borderRadius: 12,
    paddingVertical: 14, marginHorizontal: 20, marginTop: 10,
  },
  addConfirmDisabled: { opacity: 0.5 },
  addConfirmText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: '#fff',
  },
});
