import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';
import WhatsAppComposeModal from '../../components/WhatsAppComposeModal';

const STATUS_COLORS = {
  active: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  prospect: { bg: '#DBEAFE', text: '#1E3A8A', dot: '#3B82F6' },
  inactive: { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
  closed: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  field_visit: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
};

// Prettify a status value for display: 'field_visit' -> 'Field Visit'.
const statusLabel = (s = '') =>
  s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export default function ClientDetailScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadClient = async () => {
    try {
      const res = await clientsApi.getById(clientId);
      setClient(res.data);
    } catch (e) {
      console.log('Error loading client', e);
      Alert.alert('Error', 'Could not load client details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadClient(); }, [clientId]));

  const handleCall = () => client?.phone && Linking.openURL(`tel:${client.phone}`);
  const handleWhatsApp = () => {
    if (!client?.phone) return;
    const number = client.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${number}`);
  };
  const handleEmail = () => client?.email && Linking.openURL(`mailto:${client.email}`);
  const handleEdit = () => navigation.navigate('AddClient', { client });

  const handleUpdateStatus = async (newStatus) => {
    try {
      await clientsApi.update(clientId, { status: newStatus });
      setClient(prev => ({ ...prev, status: newStatus }));
    } catch (e) {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  if (!client) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Theme.colors.textSecondary} />
        <Text style={styles.errorText}>Client not found</Text>
      </View>
    );
  }

  const sc = STATUS_COLORS[client.status] || { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadClient(); }} />}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{client.name?.substring(0, 2).toUpperCase() || 'UN'}</Text>
        </View>
        <Text style={styles.clientName}>{client.name}</Text>
        {client.company ? <Text style={styles.company}>{client.company}</Text> : null}

        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
          <Text style={[styles.statusText, { color: sc.text }]}>
            {statusLabel(client.status)}
          </Text>
        </View>

        {client.tapifyProfileCreated && (
          <View style={styles.tapifyBadge}>
            <Ionicons name="card" size={14} color="#10B981" />
            <Text style={styles.tapifyBadgeText}>Tapify Profile Active</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
            <View style={[styles.actionIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="call" size={22} color={Theme.colors.success} />
            </View>
            <Text style={styles.actionLabel}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setComposeOpen(true)}>
            <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            </View>
            <Text style={styles.actionLabel}>WhatsApp</Text>
          </TouchableOpacity>
          {client.email ? (
            <TouchableOpacity style={styles.actionBtn} onPress={handleEmail}>
              <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="mail" size={22} color={Theme.colors.primary} />
              </View>
              <Text style={styles.actionLabel}>Email</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.actionBtn} onPress={handleEdit}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="create" size={22} color={Theme.colors.warning} />
            </View>
            <Text style={styles.actionLabel}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        <InfoRow icon="call-outline" label="Phone" value={client.phone} />
        <InfoRow icon="mail-outline" label="Email" value={client.email || 'Not provided'} />
        <InfoRow icon="business-outline" label="Company" value={client.company || 'Not provided'} />
        <InfoRow icon="location-outline" label="Location" value={[client.area, client.city].filter(Boolean).join(', ') || 'Not provided'} />
      </View>

      {/* Update Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Update Status</Text>
        <View style={styles.statusGrid}>
          {['prospect', 'active', 'inactive', 'closed', 'field_visit'].map((s) => {
            const c = STATUS_COLORS[s] || { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' };
            const isActive = client.status === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.statusChip, { backgroundColor: c.bg }, isActive && styles.statusChipActive]}
                onPress={() => handleUpdateStatus(s)}
              >
                <Text style={[styles.statusChipText, { color: c.text }, isActive && styles.statusChipTextActive]}>
                  {statusLabel(s)}
                </Text>
                {isActive && <Ionicons name="checkmark-circle" size={14} color={c.dot} style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Notes */}
      {client.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{client.notes}</Text>
        </View>
      ) : null}

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {client.createdAt ? <InfoRow icon="time-outline" label="Created" value={new Date(client.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} /> : null}
        {client.updatedAt ? <InfoRow icon="refresh-outline" label="Last Updated" value={new Date(client.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} /> : null}
      </View>

      <WhatsAppComposeModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        recipient={{ phone: client.phone, name: client.name, entity: 'client', entityId: client._id }}
      />
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconBox}>
        <Ionicons name={icon} size={18} color={Theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  headerCard: {
    backgroundColor: Theme.colors.white,
    margin: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.m,
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  clientName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    textAlign: 'center',
  },
  company: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.round,
    marginTop: Theme.spacing.m,
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
  },
  tapifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Theme.borderRadius.round,
    marginTop: 8,
    gap: 6,
  },
  tapifyBadgeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: Theme.typography.weights.bold,
    color: '#10B981',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.l,
    gap: 16,
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    fontWeight: Theme.typography.weights.medium,
  },
  section: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginBottom: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.l,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginBottom: Theme.spacing.m,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.m,
    gap: 12,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    marginTop: 1,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Theme.borderRadius.round,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusChipActive: { borderColor: Theme.colors.primary },
  statusChipText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.medium,
  },
  statusChipTextActive: { fontWeight: Theme.typography.weights.bold },
  notesText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    lineHeight: 24,
  },
});
