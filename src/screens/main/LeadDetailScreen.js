import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { leadsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const STATUS_COLORS = {
  new: { bg: '#DBEAFE', text: '#1E3A8A', dot: '#3B82F6' },
  contacted: { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  qualified: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  proposal: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
  negotiation: { bg: '#FFEDD5', text: '#9A3412', dot: '#F97316' },
  won: { bg: '#D1FAE5', text: '#065F46', dot: '#059669' },
  lost: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
};

export default function LeadDetailScreen({ route, navigation }) {
  const { leadId } = route.params;
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLead = async () => {
    try {
      const res = await leadsApi.getById(leadId);
      setLead(res.data);
    } catch (e) {
      console.log('Error loading lead', e);
      Alert.alert('Error', 'Could not load lead details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadLead(); }, [leadId]));

  const handleCall = () => {
    if (!lead?.phone) return;
    Linking.openURL(`tel:${lead.phone}`);
  };

  const handleWhatsApp = () => {
    if (!lead?.phone) return;
    const number = lead.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${number}`);
  };

  const handleEmail = () => {
    if (!lead?.email) return;
    Linking.openURL(`mailto:${lead.email}`);
  };

  const handleDirections = () => {
    if (!lead?.address) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`);
  };

  const CALL_RESULT_LABEL = {
    not_called: 'Not Called', no_answer: "Didn't Pick Up",
    interested: 'Interested', not_interested: 'Not Interested',
  };

  const handleEdit = () => {
    navigation.navigate('AddLead', { lead });
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      await leadsApi.update(leadId, { status: newStatus });
      setLead(prev => ({ ...prev, status: newStatus }));
    } catch (e) {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Lead',
      `Are you sure you want to delete ${lead?.name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await leadsApi.update(leadId, { deleted: true });
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete lead.');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  if (!lead) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Theme.colors.textSecondary} />
        <Text style={styles.errorText}>Lead not found</Text>
      </View>
    );
  }

  const sc = STATUS_COLORS[lead.status] || { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLead(); }} />}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{lead.name?.substring(0, 2).toUpperCase() || 'UN'}</Text>
        </View>
        <Text style={styles.leadName}>{lead.name}</Text>
        {lead.company ? <Text style={styles.company}>{lead.company}</Text> : null}

        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
          <Text style={[styles.statusText, { color: sc.text }]}>
            {lead.status?.charAt(0).toUpperCase() + lead.status?.slice(1)}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
            <Ionicons name="call" size={22} color={Theme.colors.success} />
            <Text style={[styles.actionLabel, { color: Theme.colors.success }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleWhatsApp}>
            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            <Text style={[styles.actionLabel, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
          {lead.email ? (
            <TouchableOpacity style={styles.actionBtn} onPress={handleEmail}>
              <Ionicons name="mail" size={22} color={Theme.colors.primary} />
              <Text style={[styles.actionLabel, { color: Theme.colors.primary }]}>Email</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.actionBtn} onPress={handleEdit}>
            <Ionicons name="create" size={22} color={Theme.colors.warning} />
            <Text style={[styles.actionLabel, { color: Theme.colors.warning }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Details Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        <InfoRow icon="call-outline" label="Phone" value={lead.phone} />
        <InfoRow icon="mail-outline" label="Email" value={lead.email || 'Not provided'} />
        <InfoRow icon="business-outline" label="Company" value={lead.company || 'Not provided'} />
        <InfoRow icon="megaphone-outline" label="Source" value={lead.source || 'Not provided'} />
      </View>

      {/* Location / Address (from telecaller) */}
      {lead.address ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location / Address</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="location-outline" size={18} color={Theme.colors.primary} />
            </View>
            <Text style={[styles.infoValue, { flex: 1 }]}>{lead.address}</Text>
          </View>
          <TouchableOpacity style={styles.directionsBtn} onPress={handleDirections}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.directionsText}>Get Directions</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Telecaller feedback */}
      {(lead.feedback || (lead.callResult && lead.callResult !== 'not_called')) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Telecaller Feedback</Text>
          {lead.callResult && lead.callResult !== 'not_called' ? (
            <InfoRow icon="call-outline" label="Call Result" value={CALL_RESULT_LABEL[lead.callResult] || lead.callResult} />
          ) : null}
          {lead.feedback ? <Text style={styles.notesText}>{lead.feedback}</Text> : null}
        </View>
      ) : null}

      {/* Update Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Update Status</Text>
        <View style={styles.statusGrid}>
          {['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((s) => {
            const c = STATUS_COLORS[s] || { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' };
            const isActive = lead.status === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.statusChip, { backgroundColor: c.bg }, isActive && styles.statusChipActive]}
                onPress={() => handleUpdateStatus(s)}
              >
                <Text style={[styles.statusChipText, { color: c.text }, isActive && styles.statusChipTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                {isActive && <Ionicons name="checkmark-circle" size={14} color={c.dot} style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Notes */}
      {lead.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{lead.notes}</Text>
        </View>
      ) : null}

      {/* Timestamps */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {lead.createdAt ? <InfoRow icon="time-outline" label="Created" value={new Date(lead.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} /> : null}
        {lead.updatedAt ? <InfoRow icon="refresh-outline" label="Last Updated" value={new Date(lead.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} /> : null}
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
        <Ionicons name="trash-outline" size={20} color={Theme.colors.error} />
        <Text style={styles.deleteBtnText}>Delete Lead</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconBox}>
        <Ionicons name={icon} size={18} color={Theme.colors.primary} />
      </View>
      <View>
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
    backgroundColor: Theme.colors.primary,
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
  leadName: {
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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.l,
    gap: 20,
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.m,
    paddingVertical: 12,
    marginTop: 6,
  },
  directionsText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Theme.spacing.m,
    marginBottom: 40,
    padding: Theme.spacing.m,
    borderWidth: 1.5,
    borderColor: Theme.colors.error,
    borderRadius: Theme.borderRadius.m,
    gap: 8,
  },
  deleteBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.error,
  },
});
