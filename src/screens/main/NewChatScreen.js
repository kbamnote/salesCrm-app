import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi, chatApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

export default function NewChatScreen({ navigation }) {
  const { user } = useAuth();
  const myId = String(user?._id || user?.id || '');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('dm'); // dm | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const insets = useSafeAreaInsets();
  const btnBottom = Math.max(insets.bottom, 10) + 20;

  useEffect(() => {
    (async () => {
      try {
        const res = await usersApi.contacts();
        setUsers((res.data || []).filter((u) => String(u._id) !== myId));
      } catch (e) {
        console.log('Error loading users', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getInitials = (name = '') => name.substring(0, 2).toUpperCase() || 'U';

  const openChat = (u) => {
    navigation.replace('ChatRoom', { toId: u._id, chatName: u.name });
  };

  const toggleSelect = (u) => {
    const id = String(u._id);
    setSelected((prev) =>
      prev.find((s) => String(s._id) === id)
        ? prev.filter((s) => String(s._id) !== id)
        : [...prev, u]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) return Alert.alert('Group name', 'Please enter a name for the group.');
    if (selected.length < 2) return Alert.alert('Members', 'Select at least 2 members for a group.');
    setCreating(true);
    try {
      const memberIds = [...selected.map((u) => u._id), myId];
      const res = await chatApi.createGroup({ name: groupName.trim(), members: memberIds });
      const group = res.data;
      navigation.replace('ChatRoom', { chatId: group._id, chatName: group.name, groupId: group._id });
    } catch (e) {
      Alert.alert('Error', 'Could not create the group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = users.filter((u) =>
    (u.name || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  const isSelected = (u) => selected.some((s) => String(s._id) === String(u._id));

  const renderUser = ({ item }) => {
    if (mode === 'dm') {
      return (
        <TouchableOpacity style={styles.row} onPress={() => openChat(item)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.role ? <Text style={styles.role}>{item.role}</Text> : null}
          </View>
          <Ionicons name="chatbubble-outline" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      );
    }

    const sel = isSelected(item);
    return (
      <TouchableOpacity style={styles.row} onPress={() => toggleSelect(item)}>
        <View style={[styles.checkbox, sel && styles.checkboxActive]}>
          {sel && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {item.role ? <Text style={styles.role}>{item.role}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'dm' && styles.toggleActive]}
          onPress={() => { setMode('dm'); setSelected([]); }}
        >
          <Ionicons name="person" size={16} color={mode === 'dm' ? '#fff' : Theme.colors.textSecondary} />
          <Text style={[styles.toggleText, mode === 'dm' && styles.toggleTextActive]}>Direct Message</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'group' && styles.toggleActive]}
          onPress={() => setMode('group')}
        >
          <Ionicons name="people" size={16} color={mode === 'group' ? '#fff' : Theme.colors.textSecondary} />
          <Text style={[styles.toggleText, mode === 'group' && styles.toggleTextActive]}>New Group</Text>
        </TouchableOpacity>
      </View>

      {/* Group name + selected chips */}
      {mode === 'group' && (
        <View style={styles.groupSection}>
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name..."
            placeholderTextColor={Theme.colors.textSecondary}
            value={groupName}
            onChangeText={setGroupName}
          />
          {selected.length > 0 && (
            <View style={styles.chipRow}>
              {selected.map((u) => (
                <TouchableOpacity key={u._id} style={styles.memberChip} onPress={() => toggleSelect(u)}>
                  <Text style={styles.chipText}>{u.name.split(' ')[0]}</Text>
                  <Ionicons name="close-circle" size={16} color={Theme.colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={styles.selectedCount}>{selected.length} member{selected.length !== 1 ? 's' : ''} selected</Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={mode === 'dm' ? 'Search teammates...' : 'Search to add members...'}
          placeholderTextColor={Theme.colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item._id || String(i)}
        renderItem={renderUser}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: mode === 'group' ? btnBottom + 30 : 20 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No teammates found</Text>
          </View>
        }
      />

      {/* Create group button — sits above the floating tab bar */}
      {mode === 'group' && selected.length > 0 && (
        <TouchableOpacity
          style={[styles.createBtn, { bottom: btnBottom }]}
          onPress={createGroup}
          disabled={creating}
          activeOpacity={0.7}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.createBtnText}>Create Group ({selected.length})</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toggleRow: {
    flexDirection: 'row', margin: 12, gap: 8,
    backgroundColor: '#F5F7FA', borderRadius: 12, padding: 4,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  toggleActive: { backgroundColor: Theme.colors.primary },
  toggleText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary,
  },
  toggleTextActive: { color: '#fff' },
  groupSection: { paddingHorizontal: 12, marginBottom: 4 },
  groupNameInput: {
    backgroundColor: '#F5F7FA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text,
    borderWidth: 1, borderColor: Theme.colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  chipText: {
    fontFamily: Theme.typography.fontFamily, fontSize: 12,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.primary,
  },
  selectedCount: {
    fontFamily: Theme.typography.fontFamily, fontSize: 11,
    color: Theme.colors.textSecondary, marginTop: 6,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA',
    margin: 12, paddingHorizontal: 14, borderRadius: 24, gap: 8,
    borderWidth: 1, borderColor: Theme.colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: 10, fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m, color: Theme.colors.text,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Theme.spacing.l, paddingVertical: Theme.spacing.m,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Theme.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  checkboxActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: Theme.spacing.m,
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: '#fff',
  },
  info: { flex: 1 },
  name: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.text,
  },
  role: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary, marginTop: 2, textTransform: 'capitalize',
  },
  separator: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 78 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary, marginTop: Theme.spacing.m,
  },
  createBtn: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 28, paddingVertical: 16,
    zIndex: 999, elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10,
  },
  createBtnText: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold, color: '#fff',
  },
});
