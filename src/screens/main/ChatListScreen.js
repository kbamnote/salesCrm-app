import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { chatApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

export default function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await chatApi.conversations();
      setConversations(res.data || []);
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
    const otherUser = item.participants?.find(p => p._id !== user?._id) || {};
    const displayName = item.name || otherUser.name || 'Chat';
    const isGroup = item.isGroup;
    const lastMsg = item.lastMessage;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ChatRoom', { chatId: item._id, chatName: displayName })}
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
            <Text style={styles.timeText}>{formatTime(lastMsg?.createdAt || item.updatedAt)}</Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.lastMsg} numberOfLines={1}>
              {lastMsg ? (lastMsg.sender?.name ? `${lastMsg.sender.name}: ` : '') + lastMsg.content : 'No messages yet'}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
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
            <Text style={styles.emptyText}>Team chats will appear here</Text>
          </View>
        }
      />
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
