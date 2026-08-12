import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi, usersApi } from '../../api';
import SocketService from '../../services/location/SocketService';
import { useAuth } from '../../context/AuthContext';
import { photoUri, initialsOf } from '../../utils/avatar';
import { Theme } from '../../theme/Theme';

export default function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Lift the FAB above the floating tab bar (its height ~58 + bottom offset).
  const fabBottom = Math.max(insets.bottom, 10) + 84;
  const myId = String(user?._id || user?.id || '');
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({}); // userId -> user, for names
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Global message search (across every chat the user belongs to).
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  // Debounced so a fast typist doesn't fire a request per keystroke.
  const runSearch = (q) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await chatApi.search(q.trim());
        setHits(res.data || []);
      } catch (e) {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const loadData = async () => {
    try {
      const [convRes, usersRes] = await Promise.allSettled([
        chatApi.conversations(),
        usersApi.contacts(),
      ]);
      if (convRes.status === 'fulfilled') setConversations(convRes.value.data || []);
      if (usersRes.status === 'fulfilled') {
        const map = {};
        (usersRes.value.data || []).forEach((u) => { map[String(u._id)] = u; });
        setUsersMap(map);
      }
    } catch (e) {
      console.log('Error loading conversations', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    loadData();
    // Refresh the list in real time when a message arrives or a group changes
    // (renamed / members changed / deleted) — debounced.
    let unsub = null;
    let unsubGroup = null;
    let t = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(loadData, 400); };
    (async () => {
      await SocketService.connect();
      unsub = SocketService.onChat(refresh);
      unsubGroup = SocketService.onGroup(refresh);
    })();
    return () => { if (unsub) unsub(); if (unsubGroup) unsubGroup(); if (t) clearTimeout(t); };
  }, []));

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const renderConversation = ({ item }) => {
    // Backend shape: { _id: chatId, last: <message>, unread: <count> }.
    const chatId = item._id;
    const isGroup = !String(chatId).includes('_');
    const otherId = isGroup ? null : String(chatId).split('_').find((id) => id !== myId);
    const displayName = isGroup
      ? (item.last?.groupName || 'Group')
      : (usersMap[otherId]?.name || item.last?.fromName || 'Chat');
    const lastMsg = item.last;
    const unread = item.unread || 0;
    // Show the person's profile picture when they have one; fall back to a monogram.
    const avatar = isGroup ? null : photoUri(usersMap[otherId]?.avatar);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ChatRoom', {
          chatId,
          toId: isGroup ? undefined : otherId,
          chatName: displayName,
          groupId: isGroup ? chatId : undefined,
        })}
      >
        <View style={[styles.avatar, isGroup && styles.groupAvatar]}>
          {isGroup ? (
            <Ionicons name="people" size={22} color="#fff" />
          ) : avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <Text style={styles.chatName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.timeText}>{formatTime(lastMsg?.createdAt)}</Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.lastMsg} numberOfLines={1}>
              {lastMsg?.deleted ? 'This message was deleted'
                : lastMsg?.type === 'image' ? '📷 Photo'
                : lastMsg?.type === 'voice' ? '🎤 Voice note'
                : (lastMsg?.content || 'No messages yet')}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  // Global search across every chat the user is in. Results open the source
  // conversation; the chat's own search bar handles jumping to the message.
  const openHit = (hit) => {
    const hitChatId = String(hit.chatId);
    const isGroup = !hitChatId.includes('_');
    const otherId = isGroup ? null : hitChatId.split('_').find((id) => id !== myId);
    setQuery('');
    setHits([]);
    navigation.navigate('ChatRoom', {
      chatId: hitChatId,
      toId: isGroup ? undefined : otherId,
      chatName: isGroup ? (hit.chatLabel || 'Group') : (usersMap[otherId]?.name || hit.chatLabel || 'Chat'),
      groupId: isGroup ? hitChatId : undefined,
    });
  };

  const renderHit = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openHit(item)}>
      <View style={styles.avatar}>
        <Ionicons name="search" size={20} color="#fff" />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={styles.chatName} numberOfLines={1}>{item.chatLabel || item.fromName}</Text>
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.lastMsg} numberOfLines={2}>
          {item.fromName}: {item.caption || item.content || item.fileName || ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={Theme.colors.textSecondary}
          value={query}
          onChangeText={runSearch}
          returnKeyType="search"
        />
        {searching ? (
          <ActivityIndicator size="small" color={Theme.colors.primary} />
        ) : query ? (
          <TouchableOpacity onPress={() => { setQuery(''); setHits([]); }}>
            <Ionicons name="close" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {query.trim().length >= 2 ? (
        <FlatList
          data={hits}
          keyExtractor={(m) => String(m._id)}
          renderItem={renderHit}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !searching ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={Theme.colors.border} />
                <Text style={styles.emptyTitle}>No matches</Text>
              </View>
            ) : null
          }
        />
      ) : (
      <FlatList
        data={conversations}
        keyExtractor={(item, i) => item._id || String(i)}
        renderItem={renderConversation}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Theme.colors.primary} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={56} color={Theme.colors.border} />
            <Text style={styles.emptyTitle}>No conversations</Text>
            <Text style={styles.emptyText}>Tap the button below to start a chat</Text>
          </View>
        }
      />
      )}

      {/* New chat FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('NewChat')}
      >
        <Ionicons name="create-outline" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.l,
    marginTop: Theme.spacing.m,
    marginBottom: Theme.spacing.s,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 8,
    padding: 0,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.l,
    paddingVertical: Theme.spacing.m,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.m,
  },
  groupAvatar: { backgroundColor: '#8B5CF6' },
  avatarImage: { width: 50, height: 50, borderRadius: 25 },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  cardContent: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    flex: 1,
  },
  timeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginLeft: 8,
  },
  cardBottom: { flexDirection: 'row', alignItems: 'center' },
  lastMsg: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  separator: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 82 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
});
