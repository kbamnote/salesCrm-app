import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersApi, targetsApi } from '../../api';
import { Theme } from '../../theme/Theme';

const curMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const targetMeta = (role) => {
  if (role === 'tme') return { unit: 'appointments', label: 'Appointment Target' };
  if (role === 'telecaller') return { unit: 'appointments', label: 'Appointments / month (with clients)' };
  if (role === 'tms') return { unit: 'calls', label: 'Call Target' };
  if (role === 'hr') return { unit: 'hirings', label: 'Hiring Target' };
  return { unit: 'revenue', label: 'Revenue Target' };
};

export default function SetTargetScreen() {
  const [users, setUsers] = useState([]);
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [month, setMonth] = useState(curMonth());
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const meta = targetMeta(selectedUser?.role);

  const loadUsers = async () => {
    try {
      const res = await usersApi.list();
      setUsers(res.data || []);
    } catch (e) {
      console.log('Error loading users', e);
    } finally {
      setLoading(false);
    }
  };

  const loadExisting = async (m) => {
    try {
      const res = await targetsApi.list({ month: m });
      setExisting(res.data || []);
    } catch (e) {
      setExisting([]);
    }
  };

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { loadExisting(month); }, [month]);

  const shiftMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const monthLabel = () => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  };

  const handleSave = async () => {
    if (!selectedUser) return Alert.alert('Select employee', 'Please choose who this target is for.');
    const val = Number(target);
    if (!val || val <= 0) return Alert.alert('Enter target', `Please enter a valid ${meta.unit} target.`);
    setSaving(true);
    try {
      await targetsApi.set({ userId: selectedUser._id, month, target: val });
      Alert.alert('Target set', `${val} ${meta.unit} target set for ${selectedUser.name} (${monthLabel()}).`);
      setTarget('');
      loadExisting(month);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save the target. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Theme.spacing.l, paddingBottom: 120 }}>
      {/* Month */}
      <Text style={styles.label}>Month</Text>
      <View style={styles.monthRow}>
        <TouchableOpacity style={styles.monthArrow} onPress={() => shiftMonth(-1)}>
          <Ionicons name="chevron-back" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel()}</Text>
        <TouchableOpacity style={styles.monthArrow} onPress={() => shiftMonth(1)}>
          <Ionicons name="chevron-forward" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Employee */}
      <Text style={styles.label}>Employee</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setPickerOpen(true)}>
        <Text style={[styles.selectText, !selectedUser && styles.placeholder]}>
          {selectedUser ? `${selectedUser.name} — ${selectedUser.role}` : 'Select an employee…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
      </TouchableOpacity>

      {/* Target value */}
      <Text style={styles.label}>{meta.label}</Text>
      <TextInput
        style={styles.input}
        placeholder={`Number of ${meta.unit} for the month`}
        placeholderTextColor={Theme.colors.textSecondary}
        keyboardType="numeric"
        value={target}
        onChangeText={setTarget}
      />
      {selectedUser ? (
        <Text style={styles.hint}>Setting a {meta.unit} target for {selectedUser.name}.</Text>
      ) : null}

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="flag" size={18} color="#fff" />
            <Text style={styles.saveText}>Set Target</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Existing targets this month */}
      <Text style={[styles.label, { marginTop: 24 }]}>Targets for {monthLabel()}</Text>
      {existing.length === 0 ? (
        <Text style={styles.empty}>No targets set for this month yet.</Text>
      ) : (
        existing.map((t) => (
          <View key={t._id} style={styles.targetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.targetName}>{t.userId?.name || 'Unknown'}</Text>
              <Text style={styles.targetRole}>{t.userId?.role || ''}</Text>
            </View>
            <Text style={styles.targetValue}>
              {t.target?.toLocaleString()} <Text style={styles.targetUnit}>{targetMeta(t.userId?.role).unit}</Text>
            </Text>
          </View>
        ))
      )}

      {/* Employee picker */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={users}
              keyExtractor={(item, i) => item._id || String(i)}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => { setSelectedUser(item); setPickerOpen(false); }}
                >
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userRole}>{item.role}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  label: {
    fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary,
    marginBottom: 6, marginTop: Theme.spacing.m,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 8, paddingVertical: 6 },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 14 },
  selectText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  placeholder: { color: Theme.colors.textSecondary },
  input: { backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  hint: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, marginTop: 6 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: Theme.borderRadius.m, paddingVertical: 15, marginTop: Theme.spacing.l },
  saveText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: '#fff' },
  empty: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, color: Theme.colors.textSecondary, marginTop: 8 },
  targetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, padding: 12, marginTop: 8, borderWidth: 1, borderColor: Theme.colors.border },
  targetName: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  targetRole: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, textTransform: 'capitalize' },
  targetValue: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold, color: Theme.colors.primary },
  targetUnit: { fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, fontWeight: Theme.typography.weights.regular },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.spacing.l, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  userRow: { paddingHorizontal: Theme.spacing.l, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text, fontWeight: Theme.typography.weights.medium },
  userRole: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, textTransform: 'capitalize' },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: Theme.spacing.l },
});
