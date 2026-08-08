import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fieldVisitReportsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const MEETING_TYPES = [
  { key: 'fresh_visit', label: 'Fresh Visit' },
  { key: 'follow_up_visit', label: 'Follow Up Visit' },
];
const CLIENT_STATUS = [
  { key: 'deal_done', label: 'Deal Done', color: '#10B981' },
  { key: 'follow_up', label: 'Follow Up', color: '#F59E0B' },
  { key: 'not_interested', label: 'Not Interested', color: '#EF4444' },
  { key: 'not_required', label: 'Not Required', color: '#6B7280' },
  { key: 'other', label: 'Other', color: '#8B5CF6' },
];
const OTHER = '__other__';

const statusMeta = (k) => CLIENT_STATUS.find((s) => s.key === k) || CLIENT_STATUS[4];
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function DailyFieldVisitScreen() {
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Dropdown sources, pulled live from the staff list.
  const [options, setOptions] = useState({ meetingDoneBy: [], assignedBy: [] });
  const [picker, setPicker] = useState(null);   // 'meetingDoneBy' | 'assignedBy'

  const blank = {
    meetingDoneBy: null, meetingDoneByName: '',
    assignedBy: null, assignedByName: '',
    clientName: '', clientContactNumber: '', businessCategory: '',
    meetingType: '', clientStatus: '', clientStatusOther: '', remark: '',
  };
  const [form, setForm] = useState(blank);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = async () => {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [s, list] = await Promise.all([
        fieldVisitReportsApi.myStats(),
        fieldVisitReportsApi.list({ from: start.toISOString() }),
      ]);
      setStats(s.data);
      setToday(list.data || []);
    } catch (e) {
      console.log('Error loading field visit reports', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    fieldVisitReportsApi.options()
      .then((r) => setOptions(r.data || { meetingDoneBy: [], assignedBy: [] }))
      .catch(() => {});
  }, []);

  const openForm = () => {
    // "Meeting Done By" defaults to the logged-in rep — they only change it if
    // they're filing on someone else's behalf.
    setForm({ ...blank, meetingDoneBy: user?._id || null, meetingDoneByName: user?.name || '' });
    setFormOpen(true);
  };

  const choose = (u) => {
    if (picker === 'meetingDoneBy') {
      setForm((p) => ({ ...p, meetingDoneBy: u === OTHER ? null : u._id, meetingDoneByName: u === OTHER ? '' : u.name }));
    } else {
      setForm((p) => ({ ...p, assignedBy: u === OTHER ? null : u._id, assignedByName: u === OTHER ? '' : u.name }));
    }
    setPicker(null);
  };

  const submit = async () => {
    if (!form.meetingDoneByName.trim()) return Alert.alert('Required', 'Please select who did the meeting.');
    if (!form.assignedByName.trim()) return Alert.alert('Required', 'Please select who assigned this meeting.');
    if (!form.clientName.trim()) return Alert.alert('Required', 'Client name is required.');
    if (!form.clientContactNumber.trim()) return Alert.alert('Required', 'Client contact number is required.');
    if (!form.businessCategory.trim()) return Alert.alert('Required', 'Business category is required.');
    if (!form.meetingType) return Alert.alert('Required', 'Please select the meeting type.');
    if (!form.clientStatus) return Alert.alert('Required', 'Please select the client status.');
    if (form.clientStatus === 'other' && !form.clientStatusOther.trim()) {
      return Alert.alert('Required', 'Please describe the client status.');
    }

    setSaving(true);
    try {
      await fieldVisitReportsApi.create(form);
      setFormOpen(false);
      setForm(blank);
      load();
      Alert.alert('Saved', 'Field visit recorded.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save the visit.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  const pickerData = picker === 'meetingDoneBy' ? options.meetingDoneBy : options.assignedBy;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      >
        {/* My progress */}
        <Text style={styles.sectionTitle}>My progress this month</Text>
        <View style={styles.statGrid}>
          <Stat label="Today" value={stats?.today} tint={Theme.colors.primary} />
          <Stat label="Total visits" value={stats?.total} tint={Theme.colors.primary} />
          <Stat label="Fresh" value={stats?.freshVisits} tint="#3B82F6" />
          <Stat label="Follow up" value={stats?.followUpVisits} tint="#F59E0B" />
          <Stat label="Deals done" value={stats?.dealDone} tint="#10B981" />
          <Stat label="Not interested" value={stats?.notInterested} tint="#EF4444" />
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openForm}>
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add Field Visit</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Today's visits ({today.length})</Text>
        {today.length === 0 ? (
          <Text style={styles.empty}>No visits recorded today yet.</Text>
        ) : today.map((v) => {
          const s = statusMeta(v.clientStatus);
          return (
            <View key={v._id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.client} numberOfLines={1}>{v.clientName}</Text>
                <View style={[styles.badge, { backgroundColor: s.color + '1A' }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>
                    {v.clientStatus === 'other' ? (v.clientStatusOther || 'Other') : s.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {MEETING_TYPES.find((m) => m.key === v.meetingType)?.label}
                {v.businessCategory ? ` · ${v.businessCategory}` : ''} · {fmtTime(v.visitDate)}
              </Text>
              <Text style={styles.meta}>{v.clientContactNumber}{v.assignedByName ? ` · assigned by ${v.assignedByName}` : ''}</Text>
              {!!v.remark && <Text style={styles.remark}>{v.remark}</Text>}
            </View>
          );
        })}
      </ScrollView>

      {/* Visit form */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => !saving && setFormOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Daily Field Visit</Text>
              <TouchableOpacity onPress={() => !saving && setFormOpen(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
              <Text style={styles.label}>Meeting Done By *</Text>
              <TouchableOpacity style={styles.select} onPress={() => setPicker('meetingDoneBy')}>
                <Text style={[styles.selectText, !form.meetingDoneByName && styles.ph]}>
                  {form.meetingDoneByName || 'Select'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
              </TouchableOpacity>
              {!form.meetingDoneBy && (
                <TextInput style={styles.input} value={form.meetingDoneByName}
                  onChangeText={(v) => setF('meetingDoneByName', v)} placeholder="Type the name"
                  placeholderTextColor={Theme.colors.textSecondary} />
              )}

              <Text style={styles.label}>Assigned By *</Text>
              <TouchableOpacity style={styles.select} onPress={() => setPicker('assignedBy')}>
                <Text style={[styles.selectText, !form.assignedByName && styles.ph]}>
                  {form.assignedByName || 'Select'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
              </TouchableOpacity>
              {!form.assignedBy && (
                <TextInput style={styles.input} value={form.assignedByName}
                  onChangeText={(v) => setF('assignedByName', v)} placeholder="Type the name"
                  placeholderTextColor={Theme.colors.textSecondary} />
              )}

              <Text style={styles.label}>Client Name *</Text>
              <TextInput style={styles.input} value={form.clientName} onChangeText={(v) => setF('clientName', v)}
                placeholder="Client / company name" placeholderTextColor={Theme.colors.textSecondary} />

              <Text style={styles.label}>Meeting Type *</Text>
              <View style={styles.chipRow}>
                {MEETING_TYPES.map((m) => (
                  <TouchableOpacity key={m.key} style={[styles.chip, form.meetingType === m.key && styles.chipOn]}
                    onPress={() => setF('meetingType', m.key)}>
                    <Text style={[styles.chipText, form.meetingType === m.key && styles.chipTextOn]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Business Category *</Text>
              <TextInput style={styles.input} value={form.businessCategory} onChangeText={(v) => setF('businessCategory', v)}
                placeholder="e.g. Builder and developer" placeholderTextColor={Theme.colors.textSecondary} />

              <Text style={styles.label}>Client Contact Number *</Text>
              <TextInput style={styles.input} value={form.clientContactNumber} keyboardType="phone-pad"
                onChangeText={(v) => setF('clientContactNumber', v)} placeholder="10-digit number"
                placeholderTextColor={Theme.colors.textSecondary} />

              <Text style={styles.label}>Client Status *</Text>
              <View style={styles.chipRow}>
                {CLIENT_STATUS.map((s) => (
                  <TouchableOpacity key={s.key}
                    style={[styles.chip, form.clientStatus === s.key && { borderColor: s.color, backgroundColor: s.color + '15' }]}
                    onPress={() => setF('clientStatus', s.key)}>
                    <Text style={[styles.chipText, form.clientStatus === s.key && { color: s.color, fontWeight: '800' }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.clientStatus === 'other' && (
                <TextInput style={styles.input} value={form.clientStatusOther}
                  onChangeText={(v) => setF('clientStatusOther', v)} placeholder="Describe the status"
                  placeholderTextColor={Theme.colors.textSecondary} />
              )}

              <Text style={styles.label}>If Any Remark</Text>
              <TextInput style={[styles.input, styles.textarea]} value={form.remark}
                onChangeText={(v) => setF('remark', v)} multiline placeholder="Optional"
                placeholderTextColor={Theme.colors.textSecondary} />
            </ScrollView>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Visit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Person picker */}
      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.sheetTitle}>
              {picker === 'meetingDoneBy' ? 'Meeting Done By' : 'Assigned By'}
            </Text>
            <FlatList
              data={[...pickerData, OTHER]}
              keyExtractor={(u, i) => (u === OTHER ? 'other' : String(u._id || i))}
              style={{ maxHeight: 340 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity style={styles.pickRow} onPress={() => choose(u)}>
                  <Text style={styles.pickName}>{u === OTHER ? 'Other…' : u.name}</Text>
                  {u !== OTHER && <Text style={styles.pickRole}>{u.role}</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Stat({ label, value, tint }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statVal, { color: tint }]}>{value ?? 0}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  sectionTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: Theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statTile: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexGrow: 1, flexBasis: '30%', minWidth: 96 },
  statVal: { fontFamily: Theme.typography.fontFamily, fontSize: 22, fontWeight: '900' },
  statLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 2, textAlign: 'center' },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 14 },
  addBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 9 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  client: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontFamily: Theme.typography.fontFamily, fontSize: 10, fontWeight: '800' },
  meta: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 3 },
  remark: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.text, marginTop: 6, fontStyle: 'italic' },
  empty: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 26 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sheetTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.text },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  pickRow: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickName: { fontFamily: Theme.typography.fontFamily, fontSize: 15, color: Theme.colors.text, fontWeight: '600' },
  pickRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize' },

  label: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  textarea: { height: 74, textAlignVertical: 'top' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 12, paddingVertical: 12 },
  selectText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  ph: { color: Theme.colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  chipOn: { borderColor: Theme.colors.primary, backgroundColor: Theme.colors.primary + '15' },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  chipTextOn: { color: Theme.colors.primary, fontWeight: '800' },

  saveBtn: { backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  saveText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
});
