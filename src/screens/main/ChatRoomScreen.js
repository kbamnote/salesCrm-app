import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Image, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { chatApi } from '../../api';
import SocketService from '../../services/location/SocketService';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const makeChatId = (a, b) => [String(a), String(b)].sort().join('_');

const uploadToCloudinary = async (uri, resourceType = 'image') => {
  const formData = new FormData();
  const ext = uri.split('.').pop() || (resourceType === 'video' ? 'm4a' : 'jpg');
  const mimeType = resourceType === 'video' ? 'audio/m4a' : `image/${ext}`;
  formData.append('file', { uri, type: mimeType, name: `upload.${ext}` });
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
  const flatListRef = useRef(null);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef(null);

  const [playingId, setPlayingId] = useState(null);
  const soundRef = useRef(null);

  const [previewImage, setPreviewImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [showMembers, setShowMembers] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  useEffect(() => {
    if (isGroup && groupId) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={openMembersModal} style={{ marginRight: 12 }}>
            <Ionicons name="people" size={22} color="#fff" />
          </TouchableOpacity>
        ),
      });
    }
  }, [isGroup, groupId, navigation]);

  const openMembersModal = async () => {
    setShowMembers(true);
    if (groupMembers.length > 0) return;
    setMembersLoading(true);
    try {
      const res = await chatApi.groupDetail(groupId);
      setGroupMembers(res.data?.members || []);
    } catch (e) {
      console.log('Error loading group members', e);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadMessages = useCallback(async () => {
    if (!chatId) { setLoading(false); return; }
    try {
      const res = await chatApi.messages(chatId);
      const msgs = res.data || [];
      setMessages(msgs);
      // If any incoming message hasn't been read by me yet, mark the chat read
      // so the unread badge clears and the sender sees a "seen" receipt.
      const hasUnread = msgs.some((m) => {
        const senderId = String(m.fromId || '');
        if (!senderId || senderId === myId) return false;
        return !(m.readBy || []).map(String).includes(myId);
      });
      if (hasUnread) chatApi.markRead(chatId).catch(() => {});
    } catch (e) {
      console.log('Error loading messages', e);
    } finally {
      setLoading(false);
    }
  }, [chatId, myId]);

  // Append a message if it's not already in the list (dedupe by _id).
  const upsertMessage = useCallback((m) => {
    if (!m || !m._id) return;
    setMessages((prev) => (
      prev.some((x) => String(x._id) === String(m._id)) ? prev : [...prev, m]
    ));
  }, []);

  // True when at least one other participant has read my message.
  const isSeenByOthers = useCallback((msg) => {
    const readBy = (msg.readBy || []).map(String).filter((id) => id !== myId);
    if (isGroup) return readBy.length > 0;
    if (toId) return readBy.includes(String(toId));
    return msg.read === true;
  }, [isGroup, toId, myId]);

  useEffect(() => {
    loadMessages();
    // Socket delivers messages in real time; this slow poll is just a safety net
    // for anything missed during a socket drop.
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Real-time: receive new messages + read-receipts over the socket.
  useEffect(() => {
    if (!chatId) return undefined;
    let unsubMsg = null;
    let unsubRead = null;
    (async () => {
      await SocketService.connect();
      unsubMsg = SocketService.onChat((m) => {
        if (String(m.chatId) !== String(chatId)) return;
        upsertMessage(m);
        // An incoming message from someone else → mark the chat read so the
        // badge clears and the sender gets a "seen" receipt.
        if (String(m.fromId) !== myId) chatApi.markRead(chatId).catch(() => {});
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
    })();
    return () => { if (unsubMsg) unsubMsg(); if (unsubRead) unsubRead(); };
  }, [chatId, myId, upsertMessage]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
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
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      const payload = isGroup ? { groupId, content: msgText } : { toId, content: msgText };
      const sent = await chatApi.send(payload);
      if (sent?.data) upsertMessage(sent.data); // instant local echo (socket dedupes)
    } catch (e) {
      const errMsg = e.response?.data?.message || 'Failed to send message.';
      Alert.alert('Error', errMsg);
      setText(msgText);
    } finally {
      setSending(false);
    }
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
      const asset = result.assets[0];
      setUploading(true);
      const url = await uploadToCloudinary(asset.uri, 'image');
      const payload = isGroup
        ? { groupId, content: url, type: 'image' }
        : { toId, content: url, type: 'image' };
      await chatApi.send(payload);
      await loadMessages();
    } catch (e) {
      Alert.alert('Error', 'Could not send image. Please try again.');
      console.log('Image send error', e);
    } finally {
      setUploading(false);
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

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageContent = (item, isMine) => {
    const msgType = item.type || 'text';

    if (msgType === 'image') {
      return (
        <TouchableOpacity onPress={() => setPreviewImage(item.content)} activeOpacity={0.8}>
          <Image
            source={{ uri: item.content }}
            style={styles.imageMsg}
            resizeMode="cover"
          />
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
      <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
        {item.content}
      </Text>
    );
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
        <View style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
          (item.type === 'image') && styles.imageBubble,
        ]}>
          {renderMessageContent(item, isMine)}
          <View style={styles.metaRow}>
            <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
              {formatTime(item.createdAt)}
            </Text>
            {isMine && (
              <Ionicons
                name={isSeenByOthers(item) ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={isSeenByOthers(item) ? '#8FE3FF' : 'rgba(255,255,255,0.7)'}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
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
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
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

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={Theme.colors.primary} />
          <Text style={styles.uploadingText}>Sending...</Text>
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
          <TouchableOpacity style={styles.attachBtn} onPress={pickImage} disabled={uploading}>
            <Ionicons name="image-outline" size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
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
          {text.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.micBtn}
              onPress={startRecording}
              disabled={uploading}
            >
              <Ionicons name="mic" size={24} color={Theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Group members modal */}
      <Modal visible={showMembers} transparent animationType="slide">
        <View style={styles.membersOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Group Members</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            {membersLoading ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginTop: 30 }} />
            ) : (
              <FlatList
                data={groupMembers}
                keyExtractor={(item) => String(item._id)}
                renderItem={({ item }) => {
                  const isMe = String(item._id) === myId;
                  return (
                    <View style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {(item.name || 'U').substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {item.name}{isMe ? ' (You)' : ''}
                        </Text>
                        {item.role ? (
                          <Text style={styles.memberRole}>{item.role}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.memberSep} />}
                ListEmptyComponent={
                  <Text style={styles.membersEmpty}>No members found</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Full-screen image preview */}
      <Modal visible={!!previewImage} transparent animationType="fade">
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
  },
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
});
