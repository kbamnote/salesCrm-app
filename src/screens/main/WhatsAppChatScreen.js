import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { whatsappApi } from '../../api';
import SocketService from '../../services/location/SocketService';
import { Theme } from '../../theme/Theme';

const WA_GREEN = '#25D366';
const WA_OUT_BUBBLE = '#DCF8C6'; // classic WhatsApp outgoing bubble tint

// Mirror the backend normalizePhone so socket docs (normalized phone) match the
// thread we opened with (which may have been a raw/formatted phone).
const normalizePhone = (p) => {
  let digits = String(p || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits;
};

const extractMessages = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const displayPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? '+' + digits : phone;
};

export default function WhatsAppChatScreen({ route, navigation }) {
  const { phone: rawPhone, name } = route.params || {};
  const insets = useSafeAreaInsets();
  const phone = rawPhone;
  const normPhone = normalizePhone(rawPhone);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const flatListRef = useRef(null);

  // Keep the header title in sync with the contact name / phone.
  useEffect(() => {
    navigation.setOptions({ title: name || displayPhone(phone) });
  }, [navigation, name, phone]);

  const load = useCallback(async () => {
    try {
      const data = await whatsappApi.thread(phone);
      setMessages(extractMessages(data));
    } catch (e) {
      console.log('Error loading WhatsApp thread', e);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  // Append a message if it isn't already in the list (dedupe by _id).
  const upsertMessage = useCallback((m) => {
    if (!m) return;
    setMessages((prev) => {
      if (m._id && prev.some((x) => String(x._id) === String(m._id))) return prev;
      return [...prev, m];
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live updates: append inbound/outbound messages for THIS phone as they arrive.
  useEffect(() => {
    let unsubIn = null;
    let unsubSent = null;
    (async () => {
      await SocketService.connect();
      const handle = (doc) => {
        if (!doc) return;
        if (normalizePhone(doc.phone) !== normPhone) return;
        upsertMessage(doc);
      };
      unsubIn = SocketService.onWhatsappIncoming(handle);
      unsubSent = SocketService.onWhatsappSent(handle);
    })();
    return () => { if (unsubIn) unsubIn(); if (unsubSent) unsubSent(); };
  }, [normPhone, upsertMessage]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);

    // Optimistic bubble — replaced/deduped once the real doc arrives.
    const optimistic = {
      _id: 'local-' + Date.now(),
      phone: normPhone,
      direction: 'out',
      body,
      status: 'sending',
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const doc = await whatsappApi.send({ phone, name, body });
      // Drop the optimistic bubble, then merge the persisted doc + refetch.
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      if (doc) upsertMessage(doc);
      load();
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...m, status: 'failed' } : m)));
      const msg = e.response?.data?.error || e.response?.data?.message || 'Could not send message.';
      Alert.alert('Send failed', msg);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = item.direction === 'out';
    const failed = item.status === 'failed';
    const isTemplate = item.kind === 'template';
    return (
      <View style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {isTemplate && !item.body ? (
            <Text style={styles.templateNote}>
              Sent template: {item.templateName || 'message'}
            </Text>
          ) : (
            <Text style={styles.bubbleText}>{item.body}</Text>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.bubbleTime}>{formatTime(item.createdAt)}</Text>
            {isMine && (
              failed ? (
                <Ionicons name="alert-circle" size={14} color={Theme.colors.error} style={{ marginLeft: 4 }} />
              ) : item.status === 'sending' ? (
                <Ionicons name="time-outline" size={13} color={Theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              ) : (
                <Ionicons
                  name={item.status === 'read' ? 'checkmark-done' : item.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.status === 'read' ? '#34B7F1' : Theme.colors.textSecondary}
                  style={{ marginLeft: 4 }}
                />
              )
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={WA_GREEN} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="logo-whatsapp" size={56} color={Theme.colors.border} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubText}>Send a message to start the conversation</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, i) => String(item._id || i)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.noticeBar}>
        <Ionicons name="information-circle-outline" size={14} color={Theme.colors.textSecondary} />
        <Text style={styles.noticeText}>
          Free text only delivers within 24h of the customer's last message. Use templates for proactive outreach.
        </Text>
      </View>

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Theme.colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECE5DD' }, // WhatsApp chat backdrop
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ECE5DD' },
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
  messagesList: { paddingVertical: Theme.spacing.m, paddingHorizontal: Theme.spacing.m },
  msgWrapper: { marginBottom: 6, maxWidth: '82%' },
  msgRight: { alignSelf: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bubbleMine: {
    backgroundColor: WA_OUT_BUBBLE,
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 3,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  bubbleText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    lineHeight: 21,
  },
  templateNote: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  bubbleTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    color: Theme.colors.textSecondary,
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFF9E6',
  },
  noticeText: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    lineHeight: 15,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: Theme.spacing.s,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    gap: 6,
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
    backgroundColor: WA_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Theme.colors.textSecondary },
});
