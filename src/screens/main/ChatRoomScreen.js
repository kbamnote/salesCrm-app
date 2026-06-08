import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

// Matches the backend's getChatId: the two user ids sorted and joined with '_'.
const makeChatId = (a, b) => [String(a), String(b)].sort().join('_');

export default function ChatRoomScreen({ route }) {
  const { chatId: paramChatId, toId: paramToId, chatName } = route.params || {};
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const myId = String(user?._id || user?.id || '');

  // Direct-message recipient: passed explicitly (new chat) or derived from the
  // chatId (reopened chat — a DM chatId is "idA_idB").
  const toId = paramToId ||
    (paramChatId && paramChatId.includes('_')
      ? paramChatId.split('_').find((id) => id !== myId)
      : null);

  // Resolve the chat id: use the one we were given, otherwise compute it from
  // the recipient so a brand-new conversation can load/send immediately.
  const chatId = paramChatId || (toId && myId ? makeChatId(myId, toId) : null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const flatListRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!chatId) { setLoading(false); return; }
    try {
      const res = await chatApi.messages(chatId);
      setMessages(res.data || []);
    } catch (e) {
      console.log('Error loading messages', e);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadMessages();
    // Poll every 5 seconds
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      // Backend derives the chatId from toId (DM) or groupId — send toId.
      await chatApi.send({ toId, content: msgText });
      await loadMessages();
    } catch (e) {
      const errMsg = e.response?.data?.message || 'Failed to send message.';
      Alert.alert('Error', errMsg);
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const isMyMessage = (msg) => {
    if (!user) return false;
    // Backend messages carry fromId/fromName.
    const senderId = String(msg.fromId || msg.sender?._id || msg.sender || '');
    return senderId === myId;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }) => {
    const isMine = isMyMessage(item);
    const prevMsg = messages[index - 1];
    const showSender = !isMine && (!prevMsg || String(prevMsg.fromId) !== String(item.fromId));

    return (
      <View style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}>
        {showSender && (
          <Text style={styles.senderName}>{item.fromName || 'Unknown'}</Text>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
            {item.content}
          </Text>
          <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={56} color={Theme.colors.border} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubText}>Send a message to start the conversation</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, i) => item._id || String(i)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input Bar */}
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
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  messagesList: {
    paddingVertical: Theme.spacing.m,
    paddingHorizontal: Theme.spacing.m,
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
  bubbleText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    lineHeight: 22,
  },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10,
    color: Theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Theme.spacing.m,
    paddingVertical: Theme.spacing.s,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    gap: 10,
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
});
