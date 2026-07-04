import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { notificationsApi, usersApi } from '../../api';
import { Theme } from '../../theme/Theme';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtWhen = (d) => `${fmtDate(d)} · ${fmtTime(d)}`;

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

  // Scheduling
  const [scheduleOn, setScheduleOn] = useState(false);
  const [schedDate, setSchedDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000)); // default: +1h
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledList, setScheduledList] = useState([]);

  // Sent history (which notifications we've already sent) + copy feedback.
  const [sentList, setSentList] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const loadScheduled = () => {
    notificationsApi.scheduled().then((r) => setScheduledList(r.data || [])).catch(() => {});
  };
  const loadSent = () => {
    setLoadingSent(true);
    notificationsApi.sent()
      .then((r) => setSentList(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingSent(false));
  };
  useEffect(() => { loadScheduled(); loadSent(); }, []);

  const copyNotification = async (item) => {
    // Interim: open the OS share sheet (which includes a "Copy" action) so this
    // works without any extra native module. TODO: once `expo-clipboard` is
    // installed, swap this for Clipboard.setStringAsync(...) for one-tap copy.
    try {
      await Share.share({ message: `${item.title}\n\n${item.msg}` });
      setCopiedId(item._id);
      setTimeout(() => setCopiedId((c) => (c === item._id ? null : c)), 1500);
    } catch (e) {
      Alert.alert('Error', 'Could not share the notification.');
    }
  };

  const onDateChange = (e, d) => {
    setShowDatePicker(false);
    if (e?.type === 'dismissed' || !d) return;
    const next = new Date(schedDate);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setSchedDate(next);
  };
  const onTimeChange = (e, d) => {
    setShowTimePicker(false);
    if (e?.type === 'dismissed' || !d) return;
    const next = new Date(schedDate);
    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
    setSchedDate(next);
  };

  const cancelScheduled = (item) => {
    Alert.alert('Cancel scheduled', `Cancel "${item.title}"?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, cancel', style: 'destructive', onPress: async () => {
        try {
          await notificationsApi.cancelScheduled(item._id);
          setScheduledList((p) => p.filter((x) => x._id !== item._id));
        } catch (e) {
          Alert.alert('Error', 'Could not cancel this scheduled notification.');
        }
      } },
    ]);
  };

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
    if (scheduleOn && schedDate.getTime() <= Date.now() + 30 * 1000) {
      return Alert.alert('Schedule time', 'Please pick a time at least a minute in the future.');
    }

    const to = mode === 'broadcast' ? 'all' : selectedUser._id;
    setSending(true);
    try {
      const payload = { to, title: title.trim(), msg: message.trim(), type: 'system' };
      if (mode === 'individual') payload.toName = selectedUser.name;
      if (scheduleOn) payload.scheduledAt = schedDate.toISOString();

      await notificationsApi.send(payload);
      Alert.alert(
        scheduleOn ? 'Scheduled' : 'Sent',
        scheduleOn
          ? `Notification scheduled for ${fmtWhen(schedDate)}.`
          : (mode === 'broadcast'
              ? 'Broadcast notification sent to all users.'
              : `Notification sent to ${selectedUser.name}.`),
      );
      setTitle('');
      setMessage('');
      setSelectedUser(null);
      setSearch('');
      if (scheduleOn) loadScheduled();
      else loadSent();
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

        {/* Delivery: now or scheduled */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery</Text>
          <View style={styles.schedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.schedLabel}>Schedule for later</Text>
              <Text style={styles.schedHint}>{scheduleOn ? fmtWhen(schedDate) : 'Send immediately'}</Text>
            </View>
            <Switch
              value={scheduleOn}
              onValueChange={setScheduleOn}
              trackColor={{ true: Theme.colors.primary, false: '#cbd5e1' }}
              thumbColor="#fff"
            />
          </View>
          {scheduleOn && (
            <View style={styles.pickerRow}>
              <TouchableOpacity style={styles.pickBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.pickText}>{fmtDate(schedDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.pickText}>{fmtTime(schedDate)}</Text>
              </TouchableOpacity>
            </View>
          )}
          {showDatePicker && (
            <DateTimePicker
              value={schedDate} mode="date" minimumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={onDateChange}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={schedDate} mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onTimeChange}
            />
          )}
        </View>

        {/* Send / Schedule button */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.7 }]}
          onPress={send}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name={scheduleOn ? 'time-outline' : 'send'} size={18} color="#fff" />
              <Text style={styles.sendBtnText}>
                {scheduleOn
                  ? 'Schedule Notification'
                  : (mode === 'broadcast' ? 'Send to All Users' : `Send to ${selectedUser?.name || 'User'}`)}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Upcoming scheduled */}
        {scheduledList.length > 0 && (
          <View style={[styles.card, { marginTop: 14 }]}>
            <Text style={styles.cardTitle}>Upcoming Scheduled ({scheduledList.length})</Text>
            {scheduledList.map((s) => (
              <View key={s._id} style={styles.schedItem}>
                <View style={styles.schedIcon}>
                  <Ionicons name="alarm-outline" size={16} color={Theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.schedItemTitle} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.schedItemMeta} numberOfLines={1}>
                    {s.to === 'all' ? 'All users' : (s.toName || 'Individual')} · {fmtWhen(s.scheduledAt)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => cancelScheduled(s)} style={styles.cancelBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Sent history — which notifications we've already sent, with copy */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <View style={styles.histHeader}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>
              Sent History{sentList.length > 0 ? ` (${sentList.length})` : ''}
            </Text>
            <TouchableOpacity onPress={loadSent} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="refresh" size={18} color={Theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loadingSent && sentList.length === 0 ? (
            <ActivityIndicator color={Theme.colors.primary} style={{ marginVertical: 12 }} />
          ) : sentList.length === 0 ? (
            <Text style={styles.emptyText}>No notifications sent yet.</Text>
          ) : (
            sentList.map((n) => (
              <View key={n._id} style={styles.histItem}>
                <View style={styles.histIcon}>
                  <Ionicons
                    name={n.to === 'all' ? 'megaphone-outline' : 'person-outline'}
                    size={16}
                    color={Theme.colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histTitle} numberOfLines={1}>{n.title}</Text>
                  {n.msg ? <Text style={styles.histMsg} numberOfLines={2}>{n.msg}</Text> : null}
                  <Text style={styles.histMeta} numberOfLines={1}>
                    {n.to === 'all' ? 'All users' : (n.toName || 'Individual')} · {fmtWhen(n.createdAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => copyNotification(n)}
                  style={styles.copyBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedId === n._id ? 'checkmark' : 'copy-outline'}
                    size={18}
                    color={copiedId === n._id ? '#10B981' : Theme.colors.primary}
                  />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
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

  // Scheduling
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  schedLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  schedHint: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2 },
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingVertical: 11,
  },
  pickText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },

  schedItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  schedIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  schedItemTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  schedItemMeta: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2 },
  cancelBtn: { padding: 4 },

  // Sent history
  histHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  histItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  histIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  histTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  histMsg: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2, lineHeight: 17 },
  histMeta: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 4 },
  copyBtn: { padding: 6, marginTop: 2 },
});
