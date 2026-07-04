import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const roleLabel = (r) =>
  r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

// Admin-only screen: manage every team member — deactivate/reactivate a login,
// delete a user, view the login email, and reset (not view) the password.
export default function TeamMembersScreen() {
  const { user } = useAuth();
  const myId = String(user?._id || user?.id || '');

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Change-password modal state
  const [pwTarget, setPwTarget] = useState(null); // the member being edited
  const [pwValue, setPwValue] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await usersApi.list();
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      Alert.alert('Error', 'Could not load team members.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = search.trim()
    ? members.filter((m) => {
        const q = search.toLowerCase();
        return (m.name || '').toLowerCase().includes(q)
          || (m.email || '').toLowerCase().includes(q)
          || (m.role || '').toLowerCase().includes(q);
      })
    : members;

  const patchMember = (id, patch) =>
    setMembers((prev) => prev.map((m) => (m._id === id ? { ...m, ...patch } : m)));

  const toggleActive = (m) => {
    const next = !m.active;
    const doIt = async () => {
      setBusyId(m._id);
      try {
        await usersApi.setActive(m._id, next);
        patchMember(m._id, { active: next });
      } catch (e) {
        Alert.alert('Error', e.response?.data?.error || 'Could not update the account.');
      } finally { setBusyId(null); }
    };
    if (next) return doIt(); // reactivating needs no confirmation
    Alert.alert(
      'Deactivate account',
      `${m.name} won't be able to log in until reactivated. Continue?`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: doIt }],
    );
  };

  const deleteMember = (m) => {
    Alert.alert(
      'Delete user',
      `Permanently delete ${m.name}'s account? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          setBusyId(m._id);
          try {
            await usersApi.remove(m._id);
            setMembers((prev) => prev.filter((x) => x._id !== m._id));
          } catch (e) {
            Alert.alert('Error', e.response?.data?.error || 'Could not delete the user.');
          } finally { setBusyId(null); }
        } },
      ],
    );
  };

  const openPw = (m) => { setPwTarget(m); setPwValue(''); setPwShow(false); };

  const savePw = async () => {
    if (pwValue.trim().length < 6) {
      return Alert.alert('Too short', 'Password must be at least 6 characters.');
    }
    setPwSaving(true);
    try {
      await usersApi.changePassword(pwTarget._id, pwValue.trim());
      const name = pwTarget.name;
      setPwTarget(null);
      setPwValue('');
      Alert.alert('Password changed', `New password set for ${name}. Share it with them securely.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not change the password.');
    } finally { setPwSaving(false); }
  };

  const renderItem = ({ item: m }) => {
    const isSelf = myId && String(m._id) === myId;
    const busy = busyId === m._id;
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <View style={[styles.avatar, !m.active && styles.avatarOff]}>
            <Text style={styles.avatarText}>{(m.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {m.name}{isSelf ? '  (You)' : ''}
            </Text>
            <Text style={styles.role}>{roleLabel(m.role)}</Text>
          </View>
          <View style={[styles.badge, m.active ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeText, { color: m.active ? Theme.colors.success : Theme.colors.error }]}>
              {m.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Login id */}
        <View style={styles.loginRow}>
          <Ionicons name="mail-outline" size={15} color={Theme.colors.textSecondary} />
          <Text style={styles.loginText} numberOfLines={1} selectable>{m.email}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, m.active ? styles.warnBtn : styles.okBtn, (isSelf || busy) && styles.btnDisabled]}
            disabled={isSelf || busy}
            onPress={() => toggleActive(m)}
          >
            <Ionicons
              name={m.active ? 'pause-circle-outline' : 'play-circle-outline'}
              size={16}
              color={m.active ? Theme.colors.warning : Theme.colors.success}
            />
            <Text style={[styles.actionText, { color: m.active ? Theme.colors.warning : Theme.colors.success }]}>
              {m.active ? 'Deactivate' : 'Activate'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.pwBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => openPw(m)}
          >
            <Ionicons name="key-outline" size={16} color={Theme.colors.primary} />
            <Text style={[styles.actionText, { color: Theme.colors.primary }]}>Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.delBtn, (isSelf || busy) && styles.btnDisabled]}
            disabled={isSelf || busy}
            onPress={() => deleteMember(m)}
          >
            <Ionicons name="trash-outline" size={16} color={Theme.colors.error} />
            <Text style={[styles.actionText, { color: Theme.colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        {busy ? <ActivityIndicator style={styles.rowLoader} color={Theme.colors.primary} /> : null}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, email, or role…"
          placeholderTextColor={Theme.colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.countText}>{filtered.length} member{filtered.length === 1 ? '' : 's'}</Text>

      <FlatList
        data={filtered}
        keyExtractor={(m) => m._id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Theme.colors.primary]} />}
        ListEmptyComponent={<Text style={styles.empty}>No members found.</Text>}
      />

      {/* Change-password modal (reset only — passwords can't be viewed) */}
      <Modal visible={!!pwTarget} transparent animationType="fade" onRequestClose={() => setPwTarget(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSub} numberOfLines={1}>{pwTarget?.name} · {pwTarget?.email}</Text>

            <View style={styles.pwField}>
              <TextInput
                style={styles.pwInput}
                placeholder="New password (min 6 characters)"
                placeholderTextColor={Theme.colors.textSecondary}
                secureTextEntry={!pwShow}
                autoCapitalize="none"
                autoCorrect={false}
                value={pwValue}
                onChangeText={setPwValue}
              />
              <TouchableOpacity onPress={() => setPwShow((s) => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={pwShow ? 'eye-off-outline' : 'eye-outline'} size={20} color={Theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>
              The user needs this new password to log in. Passwords can't be viewed later — only reset.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPwTarget(null)} disabled={pwSaving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn, pwSaving && styles.btnDisabled]} onPress={savePw} disabled={pwSaving}>
                {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Set Password</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.background },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Theme.colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10, margin: 14, marginBottom: 4,
  },
  searchInput: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text, padding: 0 },
  countText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary,
    marginHorizontal: 18, marginBottom: 6,
  },

  card: {
    backgroundColor: Theme.colors.surface, borderRadius: 14, padding: 14, marginBottom: 12,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOff: { backgroundColor: Theme.colors.textSecondary },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '700', color: '#fff' },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },
  role: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeOn: { backgroundColor: Theme.colors.success + '18' },
  badgeOff: { backgroundColor: Theme.colors.error + '18' },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '700' },

  loginRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, backgroundColor: Theme.colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  loginText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: 10, borderWidth: 1,
  },
  actionText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700' },
  warnBtn: { backgroundColor: Theme.colors.warning + '12', borderColor: Theme.colors.warning + '55' },
  okBtn: { backgroundColor: Theme.colors.success + '12', borderColor: Theme.colors.success + '55' },
  pwBtn: { backgroundColor: Theme.colors.primary + '12', borderColor: Theme.colors.primary + '55' },
  delBtn: { backgroundColor: Theme.colors.error + '12', borderColor: Theme.colors.error + '55' },
  btnDisabled: { opacity: 0.4 },
  rowLoader: { marginTop: 10 },

  empty: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, textAlign: 'center', marginTop: 40 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: Theme.colors.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.text },
  modalSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 3, marginBottom: 16 },
  pwField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Theme.colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  pwInput: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text, paddingVertical: 10 },
  modalNote: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 10, lineHeight: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, minHeight: 46 },
  cancelBtn: { backgroundColor: Theme.colors.background, borderWidth: 1, borderColor: Theme.colors.border },
  cancelText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.textSecondary },
  saveBtn: { backgroundColor: Theme.colors.primary },
  saveText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: '#fff' },
});
