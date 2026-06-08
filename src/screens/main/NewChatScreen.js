import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

export default function NewChatScreen({ navigation }) {
  const { user } = useAuth();
  const myId = String(user?._id || user?.id || '');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await usersApi.contacts();
        const list = (res.data || []).filter((u) => String(u._id) !== myId);
        setUsers(list);
      } catch (e) {
        console.log('Error loading users', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getInitials = (name = '') => name.substring(0, 2).toUpperCase() || 'U';

  const openChat = (u) => {
    // replace so the back button returns to the chat list, not this picker.
    navigation.replace('ChatRoom', { toId: u._id, chatName: u.name });
  };

  const filtered = users.filter((u) =>
    (u.name || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  const renderUser = ({ item }) => (
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teammates..."
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No teammates found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    margin: Theme.spacing.m,
    paddingHorizontal: 14,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.l,
    paddingVertical: Theme.spacing.m,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.m,
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  info: { flex: 1 },
  name: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  role: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  separator: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 78 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
});
