import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import SignatureScreen from 'react-native-signature-canvas';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { offerLetterApi } from '../../api';
import { Theme } from '../../theme/Theme';

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');

export default function OfferLetterScreen({ navigation }) {
  const [designations, setDesignations] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const [employeeName, setEmployeeName] = useState('');
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState(null); // Date object
  const [salary, setSalary] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [signature, setSignature] = useState(null); // base64 data URL
  const sigRef = useRef(null);

  useEffect(() => {
    offerLetterApi.designations()
      .then((r) => setDesignations(r.data || []))
      .catch(() => setDesignations([]));
  }, []);

  const onPickDate = (event, d) => {
    setShowDate(false);
    if (event?.type === 'dismissed' || !d) return;
    setJoiningDate(d);
  };

  const generate = async () => {
    if (!employeeName.trim()) return Alert.alert('Name required', 'Please enter the employee name.');
    if (!designation) return Alert.alert('Designation required', 'Please select a designation.');
    setGenerating(true);
    try {
      const res = await offerLetterApi.generate({
        employeeName: employeeName.trim(),
        designation,
        joiningDate: joiningDate ? fmtDate(joiningDate) : '',
        salary: salary.trim(),
        signature: signature || undefined,
      });
      const { filename, base64 } = res.data;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Appointment Letter',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Letter saved as ${filename}.`);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not generate the letter. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Ionicons name="menu" size={26} color={Theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Offer Letter</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: Theme.spacing.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Employee Name *</Text>
        <TextInput style={styles.input} value={employeeName} onChangeText={setEmployeeName} placeholder="e.g. Ramesh Kumar" placeholderTextColor={Theme.colors.textSecondary} />

        <Text style={styles.label}>Designation *</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setPickerOpen(true)}>
          <Text style={[styles.selectText, !designation && styles.placeholder]}>{designation || 'Select a designation…'}</Text>
          <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        {designation ? <Text style={styles.hint}>Roles & responsibilities for “{designation}” will be filled automatically.</Text> : null}

        <Text style={styles.label}>Joining Date</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setShowDate(true)}>
          <Text style={[styles.selectText, !joiningDate && styles.placeholder]}>{joiningDate ? fmtDate(joiningDate) : 'Pick a date…'}</Text>
          <Ionicons name="calendar-outline" size={18} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        {showDate && (
          <DateTimePicker
            value={joiningDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            onChange={onPickDate}
          />
        )}

        <Text style={styles.label}>Monthly Salary (₹)</Text>
        <TextInput style={styles.input} value={salary} onChangeText={setSalary} keyboardType="numeric" placeholder="e.g. 25000" placeholderTextColor={Theme.colors.textSecondary} />

        <Text style={styles.label}>Digital Signature (optional)</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setSigOpen(true)}>
          <Text style={[styles.selectText, !signature && styles.placeholder]}>
            {signature ? 'Signature added ✓  (tap to redo)' : 'Tap to draw signature'}
          </Text>
          <Ionicons name={signature ? 'checkmark-circle' : 'create-outline'} size={20} color={signature ? Theme.colors.success : Theme.colors.textSecondary} />
        </TouchableOpacity>
        {signature ? (
          <TouchableOpacity onPress={() => setSignature(null)}>
            <Text style={[styles.hint, { color: Theme.colors.error }]}>Remove signature</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={[styles.genBtn, generating && { opacity: 0.7 }]} onPress={generate} disabled={generating}>
          {generating ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={styles.genText}>Generate & Download</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.note}>The letter date defaults to today. The finished Word document will open to share, save, or print.</Text>
      </ScrollView>

      {/* Signature pad */}
      <Modal visible={sigOpen} animationType="slide" onRequestClose={() => setSigOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Draw Signature</Text>
            <TouchableOpacity onPress={() => setSigOpen(false)}>
              <Ionicons name="close" size={24} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>
          <SignatureScreen
            ref={sigRef}
            onOK={(sig) => { setSignature(sig); setSigOpen(false); }}
            onEmpty={() => Alert.alert('Empty', 'Please draw your signature first.')}
            descriptionText="Sign within the box"
            webStyle={`.m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: none; } body,html { height: 100%; margin: 0; }`}
          />
          <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
            <TouchableOpacity style={[styles.genBtn, { flex: 1, backgroundColor: Theme.colors.textSecondary, marginTop: 0 }]} onPress={() => sigRef.current?.clearSignature()}>
              <Text style={styles.genText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.genBtn, { flex: 1, backgroundColor: Theme.colors.success, marginTop: 0 }]} onPress={() => sigRef.current?.readSignature()}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.genText}>Save</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Designation picker */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Designation</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={designations}
              keyExtractor={(item, i) => item || String(i)}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<Text style={styles.note}>No designations configured.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.optRow} onPress={() => { setDesignation(item); setPickerOpen(false); }}>
                  <Text style={styles.optText}>{item}</Text>
                  {designation === item ? <Ionicons name="checkmark" size={20} color={Theme.colors.primary} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuBtn: { padding: 4 },
  screenTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xl, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, fontWeight: Theme.typography.weights.bold, color: Theme.colors.textSecondary, marginBottom: 6, marginTop: Theme.spacing.m },
  input: { backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 14 },
  selectText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  placeholder: { color: Theme.colors.textSecondary },
  hint: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, marginTop: 6 },
  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: Theme.borderRadius.m, paddingVertical: 15, marginTop: Theme.spacing.xl },
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
