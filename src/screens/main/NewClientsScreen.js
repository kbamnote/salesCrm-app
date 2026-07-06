import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { newClientsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUS = {
  awaiting_details: { label: 'Awaiting', bg: '#F3F4F6', color: '#6B7280' },
  new: { label: 'New', bg: '#DBEAFE', color: '#1E40AF' },
  in_progress: { label: 'In progress', bg: '#FEF3C7', color: '#92400E' },
  done: { label: 'Done', bg: '#D1FAE5', color: '#065F46' },
};
const NEXT = { new: 'in_progress', in_progress: 'done', done: 'new' };
const fmtWhen = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function NewClientsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await newClientsApi.list();
      setItems(res.data || []);
    } catch (e) {
      console.log('Error loading new clients', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const cycleStatus = async (item) => {
    const next = NEXT[item.status] || 'in_progress';
    setBusyId(item._id);
    try {
      const res = await newClientsApi.update(item._id, { status: next });
      setItems((prev) => prev.map((x) => (x._id === item._id ? res.data : x)));
    } catch (e) {
      Alert.alert('Error', 'Could not update status.');
    } finally {
      setBusyId(null);
    }
  };

  const openLink = (url) => { if (url) Linking.openURL(url).catch(() => {}); };
  const openWhatsApp = (phone) => { if (phone) Linking.openURL(`https://wa.me/${String(phone).replace(/\D/g, '')}`).catch(() => {}); };

  const renderItem = ({ item }) => {
    const s = STATUS[item.status] || STATUS.new;
    const isOpen = expanded === item._id;
    const heading = item.businessName || item.name || item.phone;
    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded(isOpen ? null : item._id)}>
          <View style={styles.cardTop}>
            {item.logoUrl ? (
              <Image source={{ uri: item.logoUrl }} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Text style={styles.logoInitials}>{(heading || 'N').substring(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{heading}</Text>
              {item.contactPerson ? <Text style={styles.sub} numberOfLines={1}>{item.contactPerson}</Text> : null}
              <Text style={styles.time}>{fmtWhen(item.createdAt)}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: s.bg }]}>
              <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
            </View>
          </View>

          {item.products?.length ? (
            <View style={styles.chips}>
              {item.products.slice(0, isOpen ? 99 : 4).map((p, i) => (
                <View key={i} style={styles.chip}><Text style={styles.chipText}>{p}</Text></View>
              ))}
              {!isOpen && item.products.length > 4 ? (
                <View style={styles.chip}><Text style={styles.chipText}>+{item.products.length - 4}</Text></View>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.details}>
            <Row icon="call-outline" label="Phone" value={item.businessPhone || item.phone} onPress={() => openWhatsApp(item.businessPhone || item.phone)} />
            {item.whatsapp ? <Row icon="logo-whatsapp" label="WhatsApp" value={item.whatsapp} onPress={() => openWhatsApp(item.whatsapp)} /> : null}
            {item.email ? <Row icon="mail-outline" label="Email" value={item.email} onPress={() => openLink(`mailto:${item.email}`)} /> : null}
            {item.instagram ? <Row icon="logo-instagram" label="Instagram" value={item.instagram} onPress={() => openLink(item.instagram)} link /> : null}
            {item.googleReviewLink ? <Row icon="star-outline" label="Google / Review" value={item.googleReviewLink} onPress={() => openLink(item.googleReviewLink)} link /> : null}
            {item.logoUrl ? <Row icon="image-outline" label="Logo" value="View logo" onPress={() => openLink(item.logoUrl)} link /> : null}

            {item.submissionText ? (
              <View style={styles.rawBox}>
                <Text style={styles.rawLabel}>Full submission</Text>
                <Text style={styles.rawText}>{item.submissionText}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.statusBtn, { backgroundColor: (STATUS[NEXT[item.status]] || STATUS.in_progress).color }]}
              onPress={() => cycleStatus(item)}
              disabled={busyId === item._id}
            >
              {busyId === item._id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.statusBtnText}>Mark as {(STATUS[NEXT[item.status]] || STATUS.in_progress).label}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item, i) => item._id || String(i)}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="sparkles-outline" size={52} color={Theme.colors.border} />
          <Text style={styles.emptyTitle}>No new clients yet</Text>
          <Text style={styles.emptyText}>Digital-card requests from WhatsApp will appear here.</Text>
        </View>
      }
    />
  );
}

function Row({ icon, label, value, onPress, link }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
      <Ionicons name={icon} size={16} color={Theme.colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, link && { color: Theme.colors.primary }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#eee' },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.primary + '15' },
  logoInitials: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.primary },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  sub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 1 },
  time: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '600', color: Theme.colors.text },
  details: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  rowLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, width: 92 },
  rowValue: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  rawBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8 },
  rawLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800', color: Theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  rawText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.text, lineHeight: 18 },
  statusBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  statusBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.textSecondary, marginTop: 12 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
