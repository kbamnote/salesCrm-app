import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { agreementApi } from '../../api';
import { Theme } from '../../theme/Theme';

const longDate = (d) => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `${day} day of ${month}, ${d.getFullYear()}`;
};

export default function AgreementScreen({ navigation }) {
  const [designations, setDesignations] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [agreementDate, setAgreementDate] = useState(new Date());
  const [generating, setGenerating] = useState(false);

  const [f, setF] = useState({
    employeeName: '', relation: 'Son', fatherName: '', age: '',
    address: '', email: '', designation: '', salary: '',
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    agreementApi.designations().then((r) => setDesignations(r.data || [])).catch(() => {});
  }, []);

  const onPickDate = (e, d) => { setShowDate(false); if (e?.type !== 'dismissed' && d) setAgreementDate(d); };

  const generate = async () => {
    if (!f.employeeName.trim()) return Alert.alert('Name required', 'Enter the employee name.');
    if (!f.designation) return Alert.alert('Designation required', 'Select a designation.');
    setGenerating(true);
    try {
      const res = await agreementApi.generate({
        ...f,
        employeeName: f.employeeName.trim(),
        agreementDate: longDate(agreementDate),
      });
      const { filename, base64 } = res.data;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dialogTitle: 'Employment Agreement',
          UTI: 'org.openxmlformats.wordprocessingml.document',
        });
      } else {
        Alert.alert('Saved', `Agreement saved as ${filename}.`);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not generate the agreement.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView contentContainerStyle={{ padding: Theme.spacing.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Field label="Employee Name *" value={f.employeeName} onChange={(v) => set('employeeName', v)} placeholder="e.g. Ramesh Kumar" />

        <Text style={styles.label}>Son / Daughter of</Text>
        <View style={styles.relRow}>
          {['Son', 'Daughter'].map((r) => (
            <TouchableOpacity key={r} style={[styles.relChip, f.relation === r && styles.relChipActive]} onPress={() => set('relation', r)}>
              <Text style={[styles.relText, f.relation === r && styles.relTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label="Father's / Parent's Name" value={f.fatherName} onChange={(v) => set('fatherName', v)} placeholder="e.g. Suresh Kumar" />
        <Field label="Age (years)" value={f.age} onChange={(v) => set('age', v)} keyboardType="numeric" placeholder="e.g. 30" />
        <Field label="Address" value={f.address} onChange={(v) => set('address', v)} placeholder="Full residential address" multiline />
        <Field label="Email" value={f.email} onChange={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />

        <Text style={styles.label}>Designation *</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setPickerOpen(true)}>
          <Text style={[styles.selectText, !f.designation && styles.placeholder]}>{f.designation || 'Select a designation…'}</Text>
          <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        {f.designation ? <Text style={styles.hint}>Duties for “{f.designation}” will be filled automatically.</Text> : null}

        <Field label="Salary / Professional Fees (₹ per month)" value={f.salary} onChange={(v) => set('salary', v)} keyboardType="numeric" placeholder="e.g. 20000" />

        <Text style={styles.label}>Agreement Date</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setShowDate(true)}>
          <Text style={styles.selectText}>{longDate(agreementDate)}</Text>
          <Ionicons name="calendar-outline" size={18} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        {showDate && (
          <DateTimePicker value={agreementDate} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={onPickDate} />
        )}

        <TouchableOpacity style={[styles.genBtn, generating && { opacity: 0.7 }]} onPress={generate} disabled={generating}>
          {generating ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={styles.genText}>Generate & Download</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.note}>Fixed clauses (term, probation, lock-in, notice, leave policy, employer details) are pre-set as per the standard agreement.</Text>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Designation</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={designations}
              keyExtractor={(item, i) => item || String(i)}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.optRow} onPress={() => { set('designation', item); setPickerOpen(false); }}>
                  <Text style={styles.optText}>{item}</Text>
                  {f.designation === item ? <Ionicons name="checkmark" size={20} color={Theme.colors.primary} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, props.multiline && { height: 72, textAlignVertical: 'top' }]} value={value} onChangeText={onChange} placeholderTextColor={Theme.colors.textSecondary} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuBtn: { padding: 4 },
  screenTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xl, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  relRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  relChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: Theme.colors.border },
  relChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  relText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, color: Theme.colors.textSecondary, fontWeight: Theme.typography.weights.bold },
  relTextActive: { color: '#fff' },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 4 },
  selectText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  placeholder: { color: Theme.colors.textSecondary },
  hint: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, marginTop: 4, marginBottom: 8 },
  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: Theme.borderRadius.m, paddingVertical: 15, marginTop: Theme.spacing.l },
  genText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: '#fff' },
  note: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, marginTop: 12, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.spacing.l, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  optRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.l, paddingVertical: 15 },
  optText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: Theme.spacing.l },
});
