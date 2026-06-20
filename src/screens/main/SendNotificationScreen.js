import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { notificationsApi, usersApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function SendNotificationScreen() {
  const [mode, setMode] = useState('broadcast'); // 'broadcast' | 'individual'
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Individual mode
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [search, setSearch] = useState('');

  const scrollRef = useRef(null);
  // Scroll the focused field above the keyboard (Android doesn't do this on its own).
  const scrollToInput = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

  useEffect(() => {
    if (mode === 'individual' && users.length === 0) {
      setLoadingUsers(true);
      usersApi.contacts()
        .then((res) => setUsers(res.data || []))
        .catch(() => Alert.alert('Error', 'Could not load users.'))
        .finally(() => setLoadingUsers(false));
    }
  }, [mode]);

  const filteredUsers = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      })
    : users;

  const send = async () => {
    if (!title.trim()) return Alert.alert('Missing', 'Enter a notification title.');
    if (!message.trim()) return Alert.alert('Missing', 'Enter a message body.');
    if (mode === 'individual' && !selectedUser) return Alert.alert('Missing', 'Select a recipient.');

    const to = mode === 'broadcast' ? 'all' : selectedUser._id;
    setSending(true);
    try {
      await notificationsApi.send({ to, title: title.trim(), msg: message.trim(), type: 'system' });
      Alert.alert(
        'Sent',
        mode === 'broadcast'
          ? 'Broadcast notification sent to all users.'
          : `Notification sent to ${selectedUser.name}.`,
      );
      setTitle('');
      setMessage('');
      setSelectedUser(null);
      setSearch('');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 320 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'broadcast' && styles.toggleActive]}
            onPress={() => { setMode('broadcast'); setSelectedUser(null); setSearch(''); }}
          >
            <Ionicons name="megaphone-outline" size={16} color={mode === 'broadcast' ? '#fff' : Theme.colors.primary} />
            <Text style={[styles.toggleText, mode === 'broadcast' && styles.toggleTextActive]}>Broadcast</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'individual' && styles.toggleActive]}
            onPress={() => setMode('individual')}
          >
            <Ionicons name="person-outline" size={16} color={mode === 'individual' ? '#fff' : Theme.colors.primary} />
            <Text style={[styles.toggleText, mode === 'individual' && styles.toggleTextActive]}>Individual</Text>
          </TouchableOpacity>
        </View>

        {mode === 'broadcast' ? (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#1d4ed8" />
            <Text style={styles.infoText}>This notification will be pushed to ALL users in the app.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Select Recipient</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email…"
              placeholderTextColor={Theme.colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
            {loadingUsers ? (
              <ActivityIndicator color={Theme.colors.primary} style={{ marginTop: 12 }} />
            ) : (
              <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                {filteredUsers.length === 0 ? (
                  <Text style={styles.emptyText}>No users found.</Text>
                ) : (
                  filteredUsers.map((u) => (
                    <TouchableOpacity
                      key={u._id}
                      style={[styles.userRow, selectedUser?._id === u._id && styles.userRowSelected]}
                      onPress={() => setSelectedUser(u)}
                    >
                      <View style={[styles.avatar, selectedUser?._id === u._id && styles.avatarSelected]}>
                        <Text style={[styles.avatarText, selectedUser?._id === u._id && { color: Theme.colors.primary }]}>
                          {u.name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{u.name}</Text>
                        <Text style={styles.userMeta}>{u.role} · {u.email}</Text>
                      </View>
                      {selectedUser?._id === u._id && (
                        <Ionicons name="checkmark-circle" size={20} color={Theme.colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        )}

        {/* Compose */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Compose Notification</Text>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            onFocus={scrollToInput}
            placeholder="Notification title"
            placeholderTextColor={Theme.colors.textSecondary}
            maxLength={100}
          />

          <Text style={styles.label}>Message *</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={message}
            onChangeText={setMessage}
            onFocus={scrollToInput}
            placeholder="Write your message here…"
            placeholderTextColor={Theme.colors.textSecondary}
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.7 }]}
          onPress={send}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>
                {mode === 'broadcast' ? 'Send to All Users' : `Send to ${selectedUser?.name || 'User'}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: Theme.colors.primary,
    backgroundColor: '#fff',
  },
  toggleActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  toggleText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  toggleTextActive: { color: '#fff' },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#dbeafe', borderRadius: 10, padding: 12, marginBottom: 14,
  },
  infoText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: '#1e40af', flex: 1 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text, marginBottom: 12 },

  searchInput: {
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 10, fontFamily: Theme.typography.fontFamily, fontSize: 14,
    color: Theme.colors.text, marginBottom: 10,
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: 'transparent',
  },
  userRowSelected: { borderColor: Theme.colors.primary, backgroundColor: '#EEF6FF' },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSelected: { backgroundColor: '#c7e0ff' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.textSecondary },
  userName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  userMeta: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 1 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, textAlign: 'center', paddingVertical: 16 },

  label: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 11, fontFamily: Theme.typography.fontFamily, fontSize: 14,
    color: Theme.colors.text, marginBottom: 8,
  },
  textarea: { minHeight: 100, paddingTop: 11 },
  charCount: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textAlign: 'right', marginTop: -4 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 14, paddingVertical: 15,
  },
  sendBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
});
