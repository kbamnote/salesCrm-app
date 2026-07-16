import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { leavesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const TYPES = [
  { key: 'casual', label: 'Casual' },
  { key: 'sick', label: 'Sick' },
  { key: 'earned', label: 'Earned' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'other', label: 'Other' },
];

const STATUS_META = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: '#FEF3C7' },
  approved:  { label: 'Approved',  color: '#10B981', bg: '#D1FAE5' },
  rejected:  { label: 'Rejected',  color: '#EF4444', bg: '#FEE2E2' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const isReviewer = (role) => role === 'admin' || role === 'hr';

export default function LeaveScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const canReview = isReviewer(user?.role);

  const [tab, setTab] = useState('mine'); // 'mine' | 'requests'
  const [statusFilter, setStatusFilter] = useState('all');

  const [myLeaves, setMyLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaveType, setLeaveType] = useState('casual');
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [reason, setReason] = useState('');

  const [rejectFor, setRejectFor] = useState(null); // leave being rejected
  const [rejectNote, setRejectNote] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const calls = [leavesApi.my()];
      if (canReview) calls.push(leavesApi.list());
      const [mineRes, allRes] = await Promise.all(calls);
      setMyLeaves(mineRes.data || []);
      if (allRes) setAllLeaves(allRes.data || []);
    } catch (e) {
      console.log('Error loading leaves', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  // Header "+" to apply for leave — always available (incl. admin/HR on the
  // Requests tab, where the bottom "Apply" button is hidden).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setApplyOpen(true)}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="add" size={28} color={Theme.colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const resetForm = () => {
    setLeaveType('casual');
    setFromDate(new Date());
    setToDate(new Date());
    setReason('');
  };

  const submitApply = async () => {
    if (!reason.trim()) return Alert.alert('Reason required', 'Please enter a reason for your leave.');
    if (toDate < fromDate) return Alert.alert('Invalid dates', 'End date cannot be before start date.');
    setSubmitting(true);
    try {
      await leavesApi.apply({
        leaveType,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        reason: reason.trim(),
      });
      setApplyOpen(false);
      resetForm();
      Alert.alert('Applied ✅', 'Your leave request has been submitted for approval.');
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not submit the leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelLeave = (leave) => {
    Alert.alert('Cancel request?', 'Withdraw this leave request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive', onPress: async () => {
          setBusyId(leave._id);
          try {
            await leavesApi.cancel(leave._id);
            load();
          } catch (e) {
            Alert.alert('Error', e.response?.data?.error || 'Could not cancel this request.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const approve = async (leave) => {
    setBusyId(leave._id);
    try {
      await leavesApi.approve(leave._id);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not approve this request.');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (leave) => { setRejectFor(leave); setRejectNote(''); };
  const submitReject = async () => {
    if (!rejectFor) return;
    setBusyId(rejectFor._id);
    try {
      await leavesApi.reject(rejectFor._id, rejectNote.trim());
      setRejectFor(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not reject this request.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredRequests = allLeaves.filter((l) => statusFilter === 'all' || l.status === statusFilter);

  const renderMine = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{TYPES.find((t) => t.key === item.leaveType)?.label || item.leaveType} Leave</Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.cardDates}>{fmtDate(item.fromDate)} → {fmtDate(item.toDate)} · {item.days} day{item.days > 1 ? 's' : ''}</Text>
        <Text style={styles.cardReason} numberOfLines={2}>{item.reason}</Text>
        {item.status === 'rejected' && item.reviewNote ? (
          <Text style={styles.reviewNote}>Reason: {item.reviewNote}</Text>
        ) : null}
        {item.reviewedByName ? (
          <Text style={styles.reviewedBy}>Reviewed by {item.reviewedByName}</Text>
        ) : null}
        {item.status === 'pending' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelLeave(item)} disabled={busyId === item._id}>
            {busyId === item._id ? <ActivityIndicator size="small" color={Theme.colors.error} /> : (
              <><Ionicons name="close-circle-outline" size={16} color={Theme.colors.error} /><Text style={styles.cancelBtnText}>Withdraw</Text></>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderRequest = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{item.userName}</Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.cardSub}>{TYPES.find((t) => t.key === item.leaveType)?.label || item.leaveType} Leave · {item.role}</Text>
        <Text style={styles.cardDates}>{fmtDate(item.fromDate)} → {fmtDate(item.toDate)} · {item.days} day{item.days > 1 ? 's' : ''}</Text>
        <Text style={styles.cardReason} numberOfLines={3}>{item.reason}</Text>
        {item.reviewedByName ? (
          <Text style={styles.reviewedBy}>
            {item.status === 'approved' ? 'Approved' : 'Reviewed'} by {item.reviewedByName}
            {item.reviewNote ? ` — ${item.reviewNote}` : ''}
          </Text>
        ) : null}
        {item.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openReject(item)} disabled={busyId === item._id}>
              <Ionicons name="close" size={16} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => approve(item)} disabled={busyId === item._id}>
              {busyId === item._id ? <ActivityIndicator size="small" color="#fff" /> : (
                <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={[styles.actionBtnText, { color: '#fff' }]}>Approve</Text></>
              )}
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
    <View style={styles.container}>
      {canReview && (
        <View style={styles.segmentRow}>
          {[['mine', 'My Leaves'], ['requests', 'Requests']].map(([key, label]) => {
            const active = tab === key;
            return (
              <TouchableOpacity key={key} style={[styles.segment, active && styles.segmentActive]} onPress={() => setTab(key)}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tab === 'mine' || !canReview ? (
        <FlatList
          data={myLeaves}
          keyExtractor={(item) => item._id}
          renderItem={renderMine}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={Theme.colors.border} />
              <Text style={styles.emptyText}>No leave requests yet</Text>
              <Text style={styles.emptySub}>Tap the button below to apply for leave.</Text>
            </View>
          }
        />
      ) : (
        <>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setStatusFilter(f.key)}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FlatList
            data={filteredRequests}
            keyExtractor={(item) => item._id}
            renderItem={renderRequest}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={Theme.colors.border} />
                <Text style={styles.emptyText}>No requests here</Text>
              </View>
            }
          />
        </>
      )}

      {(tab === 'mine' || !canReview) && (
        <TouchableOpacity style={styles.fab} onPress={() => setApplyOpen(true)}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Apply for Leave</Text>
        </TouchableOpacity>
      )}

      {/* Apply modal */}
      <Modal visible={applyOpen} animationType="slide" transparent onRequestClose={() => setApplyOpen(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply for Leave</Text>
              <TouchableOpacity onPress={() => setApplyOpen(false)}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Leave Type</Text>
              <View style={styles.chipWrap}>
                {TYPES.map((t) => {
                  const active = leaveType === t.key;
                  return (
                    <TouchableOpacity key={t.key} style={[styles.typeOpt, active && styles.typeOptActive]} onPress={() => setLeaveType(t.key)}>
                      <Text style={[styles.typeOptText, active && styles.typeOptTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>From</Text>
              <TouchableOpacity style={styles.dateBox} onPress={() => setShowFrom(true)}>
                <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.dateBoxText}>{fmtDate(fromDate)}</Text>
              </TouchableOpacity>
              {showFrom && (
                <DateTimePicker
                  value={fromDate} mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(e, d) => { setShowFrom(false); if (e?.type !== 'dismissed' && d) setFromDate(d); }}
                />
              )}

              <Text style={styles.fieldLabel}>To</Text>
              <TouchableOpacity style={styles.dateBox} onPress={() => setShowTo(true)}>
                <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.dateBoxText}>{fmtDate(toDate)}</Text>
              </TouchableOpacity>
              {showTo && (
                <DateTimePicker
                  value={toDate} mode="date" minimumDate={fromDate}
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(e, d) => { setShowTo(false); if (e?.type !== 'dismissed' && d) setToDate(d); }}
                />
              )}

              <Text style={styles.fieldLabel}>Reason</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="Why are you requesting leave?"
                placeholderTextColor={Theme.colors.textSecondary}
              />

              <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submitApply} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.submitBtnText}>Submit Request</Text></>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject modal */}
      <Modal visible={!!rejectFor} animationType="fade" transparent onRequestClose={() => setRejectFor(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Request</Text>
              <TouchableOpacity onPress={() => setRejectFor(null)}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            <View style={{ padding: 18 }}>
              <Text style={styles.fieldLabel}>Reason (optional)</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                placeholder="Let them know why…"
                placeholderTextColor={Theme.colors.textSecondary}
              />
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#EF4444' }]} onPress={submitReject} disabled={busyId === rejectFor?._id}>
                {busyId === rejectFor?._id ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="close-circle" size={18} color="#fff" /><Text style={styles.submitBtnText}>Confirm Reject</Text></>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  segmentRow: { flexDirection: 'row', backgroundColor: '#fff', margin: 14, marginBottom: 4, borderRadius: 10, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: Theme.colors.primary },
  segmentText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.textSecondary },
  segmentTextActive: { color: '#fff' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border },
  filterChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary },
  filterTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text, flex: 1 },
  cardSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  cardDates: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, fontWeight: '600' },
  cardReason: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, marginTop: 6, lineHeight: 18 },
  reviewNote: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: '#EF4444', marginTop: 6, fontStyle: 'italic' },
  reviewedBy: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '700' },

  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  cancelBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.error },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  rejectBtn: { backgroundColor: '#FEE2E2' },
  approveBtn: { backgroundColor: '#10B981' },
  actionBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12, fontWeight: '700' },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },

  fab: {
    position: 'absolute', right: 16, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14,
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  fabText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },

  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeOpt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  typeOptActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  typeOptText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text },
  typeOptTextActive: { color: '#fff' },

  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  dateBoxText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '600', color: Theme.colors.text },

  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  submitBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
});
