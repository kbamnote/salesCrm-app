import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Modal, ScrollView, Alert,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { callsApi, leadsApi, usersApi } from '../../api';
import { Theme } from '../../theme/Theme';

const OUTCOME_META = {
  interested:      { label: 'Interested',      color: '#10B981', bg: '#D1FAE5' },
  not_interested:  { label: 'Not Interested',  color: '#EF4444', bg: '#FEE2E2' },
  meeting_fixed:   { label: 'Meeting Fixed',   color: '#4a90e2', bg: '#E5EEFB' },
  callback:        { label: 'Callback',        color: '#F59E0B', bg: '#FEF3C7' },
  no_answer:       { label: 'No Answer',       color: '#6B7280', bg: '#F3F4F6' },
};

const LEAD_META = {
  new:         { label: 'New',         color: '#6B7280', bg: '#F3F4F6' },
  contacted:   { label: 'Contacted',   color: '#4a90e2', bg: '#E5EEFB' },
  qualified:   { label: 'Qualified',   color: '#06B6D4', bg: '#CFFAFE' },
  proposal:    { label: 'Proposal',    color: '#F59E0B', bg: '#FEF3C7' },
  negotiation: { label: 'Negotiation', color: '#F97316', bg: '#FFEDD5' },
  won:         { label: 'Won',         color: '#10B981', bg: '#D1FAE5' },
  lost:        { label: 'Lost',        color: '#EF4444', bg: '#FEE2E2' },
  converted:   { label: 'Converted',   color: '#22C55E', bg: '#DCFCE7' },
  dropped:     { label: 'Dropped',     color: '#6B7280', bg: '#F3F4F6' },
};
// Telecaller call outcome → status of the call attempt.
const CALL_RESULT_META = {
  not_called:     { label: 'Not Called',     color: '#6B7280', bg: '#F3F4F6' },
  no_answer:      { label: "Didn't Pick",    color: '#F59E0B', bg: '#FEF3C7' },
  interested:     { label: 'Interested',     color: '#10B981', bg: '#D1FAE5' },
  not_interested: { label: 'Not Interested', color: '#EF4444', bg: '#FEE2E2' },
};
// Map the call result to a Call-log outcome value.
const RESULT_TO_OUTCOME = { no_answer: 'no_answer', interested: 'interested', not_interested: 'not_interested' };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'assigned', label: 'Assigned' },
];

const LEAD_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_called', label: 'Not Called' },
  { key: 'called', label: 'Called' },
  { key: 'interested', label: 'Interested' },
];

export default function CallsScreen() {
  const [segment, setSegment] = useState('leads'); // 'leads' | 'calls'
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');

  // Lead action / assign
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadActionOpen, setLeadActionOpen] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  // Action-sheet working fields
  const [outcome, setOutcome] = useState('not_called');
  const [feedback, setFeedback] = useState('');
  const [address, setAddress] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [salesList, setSalesList] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [usersMap, setUsersMap] = useState({}); // id -> name, to resolve assignee

  const load = async () => {
    try {
      const [callsRes, leadsRes, usersRes] = await Promise.allSettled([
        callsApi.list(), leadsApi.list(), usersApi.contacts(),
      ]);
      if (callsRes.status === 'fulfilled') setCalls(callsRes.value.data || []);
      if (leadsRes.status === 'fulfilled') setLeads(leadsRes.value.data || []);
      if (usersRes.status === 'fulfilled') {
        const us = usersRes.value.data || [];
        const map = {};
        us.forEach((u) => { map[String(u._id)] = u.name; });
        setUsersMap(map);
        setSalesList(us.filter((u) => u.role === 'sales'));
      }
    } catch (e) {
      console.log('Error loading calls/leads', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  // Seed the action-sheet fields when a lead is opened.
  useEffect(() => {
    if (selectedLead) {
      setOutcome(selectedLead.callResult || 'not_called');
      setFeedback(selectedLead.feedback || '');
      setAddress(selectedLead.address || '');
    }
  }, [selectedLead?._id]);

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = (d) => {
    const cd = d ? new Date(d).toISOString().split('T')[0] : '';
    return cd === todayStr;
  };

  // ───── Call log ─────
  const refreshCalls = () => callsApi.list().then((r) => setCalls(r.data || [])).catch(() => {});

  const filteredCalls = calls.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'today') return isToday(c.date || c.createdAt);
    if (filter === 'assigned') return !!c.assignedSalesName;
    return true;
  });
  const todayCount = calls.filter((c) => isToday(c.date || c.createdAt)).length;
  const assignedCount = calls.filter((c) => !!c.assignedSalesName).length;

  // ───── Leads filter ─────
  const filteredLeads = leads.filter((l) => {
    const r = l.callResult || 'not_called';
    if (leadFilter === 'all') return true;
    if (leadFilter === 'not_called') return r === 'not_called';
    if (leadFilter === 'called') return r !== 'not_called';
    if (leadFilter === 'interested') return r === 'interested';
    return true;
  });
  const notCalledCount = leads.filter((l) => (l.callResult || 'not_called') === 'not_called').length;

  const fmtTime = (d) => {
    if (!d) return '';
    const dt = new Date(d), now = new Date();
    if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return dt.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Record/refresh this lead in the call log (one entry per lead).
  const logLead = (lead, extra = {}) => {
    if (!lead?._id) return;
    callsApi.logLead({
      leadId: lead._id,
      clientName: lead.name,
      phone: lead.phone || '',
      status: extra.status ?? lead.status,
      ...extra,
    }).then(refreshCalls).catch(() => {});
  };

  // ───── Leads ─────
  const callLead = (lead) => {
    if (lead?.phone) Linking.openURL(`tel:${lead.phone}`);
    logLead(lead); // remember that we called this lead
  };

  const saveLeadDetails = async () => {
    if (!selectedLead) return;
    if (outcome === 'interested' && !address.trim()) {
      return Alert.alert('Address needed', 'Please add the location/address for an interested lead.');
    }
    setLeadBusy(true);
    try {
      const res = await leadsApi.update(selectedLead._id, { callResult: outcome, feedback, address });
      setSelectedLead(res.data);
      setLeads((prev) => prev.map((l) => (l._id === res.data._id ? res.data : l)));
      logLead(res.data, { outcome: RESULT_TO_OUTCOME[outcome], notes: feedback });
      Alert.alert('Saved', 'Call details updated.');
    } catch (e) {
      Alert.alert('Error', 'Could not save the details.');
    } finally {
      setLeadBusy(false);
    }
  };

  const openAssign = async () => {
    setLeadActionOpen(false);
    setAssignOpen(true);
    if (salesList.length === 0) {
      setSalesLoading(true);
      try {
        const res = await usersApi.contacts();
        const us = res.data || [];
        setSalesList(us.filter((u) => u.role === 'sales'));
        const map = {}; us.forEach((u) => { map[String(u._id)] = u.name; });
        setUsersMap((prev) => ({ ...prev, ...map }));
      } catch (_) { setSalesList([]); }
      finally { setSalesLoading(false); }
    }
  };

  const doAssign = async (salesUser) => {
    const lead = selectedLead;
    if (!lead) return;
    setLeadBusy(true);
    try {
      // Persist the call details (interested + feedback + address) alongside the assignment.
      await leadsApi.update(lead._id, { callResult: 'interested', feedback, address });
      await leadsApi.assign(lead._id, { salesId: salesUser._id, status: 'qualified' });
      logLead(lead, { status: 'qualified', outcome: 'interested', notes: feedback, assignedSalesId: salesUser._id, assignedSalesName: salesUser.name });
      setAssignOpen(false);
      setSelectedLead(null);
      Alert.alert('Lead assigned ✅', `"${lead.name}" is now assigned to ${salesUser.name}. They've been notified and it shows in your Call Log.`);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not assign the lead.');
    } finally {
      setLeadBusy(false);
    }
  };

  const assignToSales = (salesUser) => {
    Alert.alert('Assign this lead?', `Assign "${selectedLead?.name}" to ${salesUser.name} (${salesUser.role})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Assign', onPress: () => doAssign(salesUser) },
    ]);
  };

  // ───── Renderers ─────
  const renderCall = ({ item }) => {
    const badge = (item.status && LEAD_META[item.status]) || (item.outcome && OUTCOME_META[item.outcome]) || LEAD_META.new;
    return (
      <View style={styles.card}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(item.clientName || 'U').substring(0, 2).toUpperCase()}</Text></View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.clientName || 'Unknown'}</Text>
          <View style={styles.cardRow}>
            <View style={[styles.chip, { backgroundColor: badge.bg }]}>
              <Text style={[styles.chipText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {item.phone ? <Text style={styles.durText}>{item.phone}</Text> : null}
          </View>
          {item.assignedSalesName ? (
            <View style={styles.assignedRow}>
              <Ionicons name="arrow-forward" size={11} color="#10B981" />
              <Text style={styles.assignedText}>Assigned to {item.assignedSalesName}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.timeText}>{fmtTime(item.date || item.createdAt)}</Text>
          {item.phone ? (
            <TouchableOpacity style={styles.callBackBtn} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
              <Ionicons name="call" size={14} color={Theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderLead = ({ item }) => {
    const meta = CALL_RESULT_META[item.callResult || 'not_called'];
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => { setSelectedLead(item); setLeadActionOpen(true); }}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || 'U').substring(0, 2).toUpperCase()}</Text></View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.cardRow}>
            <View style={[styles.chip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {item.phone ? <Text style={styles.durText}>{item.phone}</Text> : null}
          </View>
          {item.assignedSales ? (
            <View style={styles.assignedRow}>
              <Ionicons name="arrow-forward" size={11} color="#10B981" />
              <Text style={styles.assignedText}>Assigned to {usersMap[String(item.assignedSales)] || 'salesperson'}</Text>
            </View>
          ) : null}
        </View>
        {item.phone ? (
          <TouchableOpacity style={styles.leadCallBtn} onPress={() => callLead(item)}>
            <Ionicons name="call" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Segmented control */}
      <View style={styles.segmentRow}>
        {[['leads', 'Leads', leads.length], ['calls', 'Call Log', calls.length]].map(([key, label, count]) => {
          const active = segment === key;
          return (
            <TouchableOpacity key={key} style={[styles.segment, active && styles.segmentActive]} onPress={() => setSegment(key)}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'calls' ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{calls.length}</Text><Text style={styles.summaryLabel}>Called</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: '#4a90e2' }]}>{todayCount}</Text><Text style={styles.summaryLabel}>Today</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: '#10B981' }]}>{assignedCount}</Text><Text style={styles.summaryLabel}>Assigned</Text></View>
          </View>

          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f.key)}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={filteredCalls}
            keyExtractor={(item, i) => item._id || String(i)}
            renderItem={renderCall}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="call-outline" size={48} color={Theme.colors.border} />
                <Text style={styles.emptyText}>No calls yet</Text>
                <Text style={styles.emptySub}>Call a lead from the Leads tab — it appears here with its status.</Text>
              </View>
            }
          />
        </>
      ) : (
        <>
          <View style={styles.filterRow}>
            {LEAD_FILTERS.map((f) => {
              const active = leadFilter === f.key;
              return (
                <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setLeadFilter(f.key)}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FlatList
            data={filteredLeads}
            keyExtractor={(item, i) => item._id || String(i)}
            renderItem={renderLead}
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
                <Text style={styles.emptyText}>{leadFilter === 'all' ? 'No leads assigned to you yet' : 'No leads match this filter'}</Text>
              </View>
            }
          />
        </>
      )}

      {/* Lead action modal */}
      <Modal visible={leadActionOpen} animationType="slide" transparent onRequestClose={() => { setLeadActionOpen(false); setSelectedLead(null); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedLead?.name || 'Lead'}</Text>
              <TouchableOpacity onPress={() => { setLeadActionOpen(false); setSelectedLead(null); }}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
              {selectedLead?.phone ? (
                <TouchableOpacity style={styles.callRow} onPress={() => callLead(selectedLead)}>
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.callRowText}>Call {selectedLead.phone}</Text>
                </TouchableOpacity>
              ) : null}

              {/* Call outcome */}
              <Text style={styles.fieldLabel}>Call Outcome</Text>
              <View style={styles.chipWrap}>
                {['no_answer', 'interested', 'not_interested'].map((r) => {
                  const meta = CALL_RESULT_META[r];
                  const active = outcome === r;
                  return (
                    <TouchableOpacity key={r} style={[styles.statusOpt, active && { backgroundColor: meta.color, borderColor: meta.color }]} onPress={() => setOutcome(r)}>
                      <Text style={[styles.statusOptText, active && { color: '#fff' }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Feedback */}
              <Text style={styles.fieldLabel}>Feedback</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                value={feedback}
                onChangeText={setFeedback}
                multiline
                placeholder="What did the lead say?"
                placeholderTextColor={Theme.colors.textSecondary}
              />

              {/* Address — only for interested leads */}
              {outcome === 'interested' && (
                <>
                  <Text style={styles.fieldLabel}>Location / Address</Text>
                  <TextInput
                    style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    placeholder="Lead's address for the sales visit"
                    placeholderTextColor={Theme.colors.textSecondary}
                  />
                </>
              )}

              {/* Save */}
              <TouchableOpacity style={[styles.saveBtn, leadBusy && { opacity: 0.6 }]} onPress={saveLeadDetails} disabled={leadBusy}>
                {leadBusy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.saveBtnText}>Save Details</Text></>}
              </TouchableOpacity>

              {/* Assign — only when interested */}
              {outcome === 'interested' && (
                <>
                  <Text style={styles.fieldLabel}>Appointment Fixed?</Text>
                  <Text style={styles.helperText}>Assign this lead to a salesperson — they'll get it in their Leads with the address, plus a notification.</Text>
                  <TouchableOpacity style={styles.assignBtn} onPress={openAssign} disabled={leadBusy}>
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={styles.assignBtnText}>Assign to Salesperson</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sales picker modal */}
      <Modal visible={assignOpen} animationType="slide" transparent onRequestClose={() => { setAssignOpen(false); setLeadActionOpen(true); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Choose Salesperson</Text>
                {selectedLead ? <Text style={styles.modalSubtitle}>for "{selectedLead.name}"</Text> : null}
              </View>
              <TouchableOpacity onPress={() => { setAssignOpen(false); setLeadActionOpen(true); }}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            {salesLoading ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={salesList}
                keyExtractor={(item) => String(item._id)}
                style={{ maxHeight: 380 }}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                ListEmptyComponent={<Text style={styles.emptySub}>No salespeople found.</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.salesRow} onPress={() => assignToSales(item)} disabled={leadBusy}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || 'U').substring(0, 2).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.salesName}>{item.name}</Text>
                      <Text style={styles.salesRole}>{item.role}</Text>
                    </View>
                    {leadBusy ? <ActivityIndicator color={Theme.colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={Theme.colors.textSecondary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  segmentRow: { flexDirection: 'row', backgroundColor: '#fff', margin: 14, marginBottom: 8, borderRadius: 10, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: Theme.colors.primary },
  segmentText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.textSecondary },
  segmentTextActive: { color: '#fff' },

  summaryRow: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 14, borderRadius: 14, padding: 14, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '800', color: Theme.colors.text },
  summaryLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: Theme.colors.border },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border },
  filterChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  filterText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary },
  filterTextActive: { color: '#fff' },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, gap: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '700' },
  durText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, fontWeight: '600' },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  assignedText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: '#10B981', fontWeight: '700' },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  timeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary },
  callBackBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  leadCallBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12, fontWeight: '700' },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 17 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text, flex: 1, marginRight: 10 },
  modalSubtitle: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2 },
  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  helperText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginBottom: 10, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  saveBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
  statusOpt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  statusOptText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 13 },
  callRowText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 14 },
  assignBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
  salesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  salesName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  salesRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: 72 },
});
