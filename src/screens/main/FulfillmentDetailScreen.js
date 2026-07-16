import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { fulfillmentApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';
import { STAGE_META } from './FulfillmentListScreen';

export default function FulfillmentDetailScreen() {
  const route = useRoute();
  const { id } = route.params || {};
  const { user } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [changeNotes, setChangeNotes] = useState('');

  const load = async () => {
    try {
      const res = await fulfillmentApi.get(id);
      setOrder(res.data);
      setPreviewUrl(res.data?.website?.previewUrl || '');
      setChangeNotes(res.data?.website?.changeNotes || '');
    } catch (e) {
      Alert.alert('Error', 'Could not load this order.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [id]));
  useEffect(() => { if (order?.website) { /* keep local inputs in sync on first load */ } }, [order?._id]);

  if (loading || !order) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  const currentStage = order.stages.find((s) => s.key === order.currentStage);
  const isClosed = order.status === 'completed';
  const canAct = currentStage && (user?.role === 'admin' || user?.role === currentStage.ownerRole);

  const toggleItem = async (stageKey, index, done) => {
    // Optimistic update, then persist.
    setOrder((prev) => {
      const next = { ...prev, stages: prev.stages.map((s) => ({ ...s, checklist: s.checklist.map((c) => ({ ...c })) })) };
      const st = next.stages.find((s) => s.key === stageKey);
      if (st) st.checklist[index].done = done;
      return next;
    });
    try {
      const res = await fulfillmentApi.toggleChecklist(id, stageKey, index, done);
      setOrder(res.data);
    } catch (e) {
      load(); // revert to server truth
      Alert.alert('Error', e.response?.data?.error || 'Could not update the checklist.');
    }
  };

  const saveWebsite = async (patch, successMsg) => {
    setBusy(true);
    try {
      const res = await fulfillmentApi.setWebsite(id, patch);
      setOrder(res.data);
      if (successMsg) Alert.alert('Saved', successMsg);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save.');
    } finally { setBusy(false); }
  };

  const shareWebsite = async () => {
    if (!previewUrl.trim()) return Alert.alert('Add a link', 'Enter the website preview link first.');
    setBusy(true);
    try {
      const res = await fulfillmentApi.shareWebsite(id, previewUrl.trim());
      setOrder(res.data);
      Alert.alert('Sent ✅', 'The preview link was sent to the client on WhatsApp.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send the link.');
    } finally { setBusy(false); }
  };

  const shareForm = async (kind) => {
    setBusy(true);
    try {
      if (kind === 'data') await fulfillmentApi.shareDataForm(id);
      else await fulfillmentApi.shareFeedback(id);
      Alert.alert('Sent ✅', `The ${kind === 'data' ? 'data collection' : 'feedback'} form link was sent to the client on WhatsApp.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send the link.');
    } finally { setBusy(false); }
  };

  const completeStage = () => {
    Alert.alert('Complete stage?', `Mark "${STAGE_META[currentStage.key]?.title || currentStage.title}" as done and move to the next stage?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setBusy(true);
          try {
            const res = await fulfillmentApi.completeStage(id, currentStage.key);
            setOrder(res.data);
          } catch (e) {
            Alert.alert('Error', e.response?.data?.error || 'Could not complete this stage.');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const statusIcon = (s) => {
    if (s.status === 'completed') return { name: 'checkmark-circle', color: '#10B981' };
    if (s.status === 'skipped') return { name: 'remove-circle-outline', color: Theme.colors.textSecondary };
    if (s.key === order.currentStage) return { name: 'radio-button-on', color: Theme.colors.primary };
    return { name: 'ellipse-outline', color: Theme.colors.border };
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
    >
      {/* Client header */}
      <View style={styles.headerCard}>
        <Text style={styles.clientName}>{order.clientName || 'Client'}</Text>
        {order.customerPhone ? (
          <TouchableOpacity style={styles.phoneRow} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
            <Ionicons name="call-outline" size={14} color={Theme.colors.primary} />
            <Text style={styles.phoneText}>{order.customerPhone}</Text>
          </TouchableOpacity>
        ) : null}
        {isClosed && (
          <View style={styles.closedBanner}>
            <Ionicons name="checkmark-done" size={16} color="#065F46" />
            <Text style={styles.closedText}>Order completed</Text>
          </View>
        )}
      </View>

      {/* Stages */}
      {order.stages.map((s) => {
        const active = s.key === order.currentStage;
        const ic = statusIcon(s);
        const meta = STAGE_META[s.key] || { title: s.title };
        return (
          <View key={s.key} style={[styles.stageCard, active && styles.stageCardActive]}>
            <View style={styles.stageHead}>
              <Ionicons name={ic.name} size={20} color={ic.color} />
              <Text style={[styles.stageTitle, s.status === 'skipped' && styles.stageSkipped]}>{meta.title}</Text>
              <Text style={styles.stageRole}>{s.ownerRole.replace('_', ' ')}</Text>
            </View>
            {s.completedByName ? (
              <Text style={styles.stageDone}>Done by {s.completedByName}</Text>
            ) : null}

            {/* Active stage: checklist + actions */}
            {active && !isClosed && (
              <View style={styles.stageBody}>
                {/* Customer form stages: send the token link over WhatsApp. */}
                {canAct && (s.key === 'data_collection' || s.key === 'feedback') && (
                  <TouchableOpacity style={[styles.smallBtn, styles.waBtn, { marginBottom: 12 }]} onPress={() => shareForm(s.key === 'data_collection' ? 'data' : 'feedback')} disabled={busy}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.waBtnText}>Send {s.key === 'data_collection' ? 'data form' : 'feedback form'} to client</Text>
                  </TouchableOpacity>
                )}
                {s.checklist.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.checkRow}
                    disabled={!canAct}
                    onPress={() => toggleItem(s.key, i, !c.done)}
                  >
                    <Ionicons name={c.done ? 'checkbox' : 'square-outline'} size={20} color={c.done ? '#10B981' : Theme.colors.textSecondary} />
                    <Text style={[styles.checkLabel, c.done && styles.checkLabelDone]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}

                {/* Website stage extras */}
                {s.key === 'website' && (
                  <View style={styles.websiteBox}>
                    <Text style={styles.fieldLabel}>Preview link</Text>
                    <TextInput
                      style={styles.input}
                      value={previewUrl}
                      onChangeText={setPreviewUrl}
                      editable={canAct}
                      autoCapitalize="none"
                      placeholder="https://…"
                      placeholderTextColor={Theme.colors.textSecondary}
                    />
                    {canAct && (
                      <View style={styles.btnRow}>
                        <TouchableOpacity style={[styles.smallBtn, styles.outlineBtn]} onPress={() => saveWebsite({ previewUrl: previewUrl.trim() }, 'Preview link saved.')} disabled={busy}>
                          <Ionicons name="save-outline" size={15} color={Theme.colors.primary} />
                          <Text style={styles.outlineBtnText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.smallBtn, styles.waBtn]} onPress={shareWebsite} disabled={busy}>
                          <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                          <Text style={styles.waBtnText}>Send to client</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <Text style={styles.fieldLabel}>Client approval</Text>
                    <View style={styles.btnRow}>
                      {['approved', 'changes'].map((st) => {
                        const on = order.website?.approvalStatus === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[styles.apprBtn, on && (st === 'approved' ? styles.apprOn : styles.changesOn)]}
                            disabled={!canAct || busy}
                            onPress={() => saveWebsite({ approvalStatus: st, changeNotes: st === 'changes' ? changeNotes.trim() : '' })}
                          >
                            <Text style={[styles.apprText, on && { color: '#fff' }]}>{st === 'approved' ? 'Approved' : 'Needs changes'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {order.website?.approvalStatus === 'changes' && (
                      <TextInput
                        style={[styles.input, { height: 60, textAlignVertical: 'top', marginTop: 8 }]}
                        value={changeNotes}
                        onChangeText={setChangeNotes}
                        editable={canAct}
                        multiline
                        placeholder="What changes did the client ask for?"
                        placeholderTextColor={Theme.colors.textSecondary}
                        onBlur={() => canAct && saveWebsite({ changeNotes: changeNotes.trim() })}
                      />
                    )}
                  </View>
                )}

                {canAct ? (
                  <TouchableOpacity style={[styles.completeBtn, busy && { opacity: 0.6 }]} onPress={completeStage} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" /> : (
                      <><Ionicons name="arrow-forward-circle" size={18} color="#fff" /><Text style={styles.completeText}>Complete Stage</Text></>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.notYours}>Waiting on the {s.ownerRole.replace('_', ' ')} team.</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  headerCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14 },
  clientName: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  phoneText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.primary, fontWeight: '600' },
  closedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, alignSelf: 'flex-start' },
  closedText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: '#065F46' },

  stageCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
  stageCardActive: { borderColor: Theme.colors.primary },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageTitle: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  stageSkipped: { textDecorationLine: 'line-through', color: Theme.colors.textSecondary },
  stageRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize' },
  stageDone: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 4, marginLeft: 30 },

  stageBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#EEF1F5', paddingTop: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkLabel: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  checkLabelDone: { color: Theme.colors.textSecondary },

  websiteBox: { marginTop: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  smallBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  outlineBtn: { borderWidth: 1, borderColor: Theme.colors.primary, backgroundColor: '#fff' },
  outlineBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
  waBtn: { backgroundColor: '#25D366' },
  waBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: '#fff' },
  apprBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  apprOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  changesOn: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  apprText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },

  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 16 },
  completeText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
  notYours: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 14, textAlign: 'center', fontStyle: 'italic' },
});
