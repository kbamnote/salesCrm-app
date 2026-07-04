import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { whatsappApi } from '../../api';
import { Theme } from '../../theme/Theme';
import SocketService from '../../services/location/SocketService';

const WA_GREEN = '#25D366';

// Normalize different API response shapes: array, {conversations:[...]}, {data:[...]}
const extractConversations = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.conversations)) return data.conversations;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

const displayPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? '+' + digits : phone;
};

export default function WhatsAppScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await whatsappApi.conversations();
      setConversations(extractConversations(data));
    } catch (e) {
      console.log('Error loading conversations', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      (async () => {
        try {
          const data = await whatsappApi.conversations();
          if (isActive) setConversations(extractConversations(data));
        } catch (e) {
          console.log('Error loading conversations', e);
        } finally {
          if (isActive) { setLoading(false); setRefreshing(false); }
        }
      })();
      return () => { isActive = false; };
    }, [])
  );

  // Live updates: any inbound/outbound WhatsApp message refreshes the list so the
  // preview, time and unread badge stay current. Falls back to focus + pull-to-refresh.
  useEffect(() => {
    let unsubIn = null;
    let unsubSent = null;
    (async () => {
      await SocketService.connect();
      unsubIn = SocketService.onWhatsappIncoming(() => { load(); });
      unsubSent = SocketService.onWhatsappSent(() => { load(); });
    })();
    return () => { if (unsubIn) unsubIn(); if (unsubSent) unsubSent(); };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openThread = (item) => {
    navigation.navigate('WhatsAppChat', {
      phone: item.phone || item._id,
      name: item.name || null,
    });
  };

  const renderConversation = ({ item }) => {
    const phone = item.phone || item._id;
    const title = item.name || displayPhone(phone);
    const preview = item.lastMessage || item.body || '';
    const outbound = item.lastDirection === 'out';
    const unread = Number(item.unread) || 0;
    const initial = (item.name || displayPhone(phone) || '#').trim().substring(0, 1).toUpperCase();

    return (
      <TouchableOpacity style={styles.card} onPress={() => openThread(item)} activeOpacity={0.7}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.name} numberOfLines={1}>{title}</Text>
            <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{formatTime(item.updatedAt)}</Text>
          </View>
          <View style={styles.cardBottomRow}>
            <View style={styles.previewWrap}>
              {outbound ? (
                <Ionicons name="return-up-forward" size={14} color={Theme.colors.textSecondary} style={{ marginRight: 3 }} />
              ) : null}
              <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {preview || 'No messages'}
              </Text>
            </View>
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Ionicons name="menu-outline" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.headerTitle}>WhatsApp</Text>
        </View>
        <View style={styles.menuBtn} />
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={WA_GREEN} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.phone || item._id)}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={WA_GREEN} />}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="logo-whatsapp" size={48} color={WA_GREEN} />
                </View>
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptyText}>
                  Messages you send from a lead or client, and replies from customers, will appear here.
                </Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: WA_GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Theme.typography.fontFamily,
  },
  menuBtn: { width: 40, alignItems: 'center' },
  listContent: { paddingBottom: 110, flexGrow: 1 },
  separator: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 78 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    paddingHorizontal: Theme.spacing.m,
    paddingVertical: 12,
  },
  avatarBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: WA_GREEN + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: WA_GREEN,
  },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginRight: 8,
  },
  time: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
  },
  timeUnread: { color: WA_GREEN, fontWeight: Theme.typography.weights.bold },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  previewWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  preview: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
  previewUnread: { color: Theme.colors.text, fontWeight: Theme.typography.weights.medium },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: WA_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: WA_GREEN + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.m,
  },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
});
