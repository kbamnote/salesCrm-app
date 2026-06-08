import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi, usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
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

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const getInitials = (name = '') => name.substring(0, 2).toUpperCase() || 'U';

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

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ChatRoom', { chatId, toId: otherId, chatName: displayName })}
      >
        <View style={[styles.avatar, isGroup && styles.groupAvatar]}>
          {isGroup ? (
            <Ionicons name="people" size={22} color="#fff" />
          ) : (
            <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <Text style={styles.chatName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.timeText}>{formatTime(lastMsg?.createdAt)}</Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.lastMsg} numberOfLines={1}>
              {lastMsg?.content || 'No messages yet'}
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

  return (
    <View style={styles.container}>
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
