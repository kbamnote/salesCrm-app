import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, Alert, AppState,
  Modal, ScrollView, TextInput, ActivityIndicator, Platform, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callsApi, callAppointmentsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

// Pull a dialable number out of whatever was copied — a WhatsApp message, a
// spreadsheet cell, an email signature. Formatting (spaces, dashes, brackets,
// "tel:") is stripped; a leading + is kept so international numbers still work.
const extractPhone = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const text = raw.trim();
  if (text.length > 200) return '';               // a pasted paragraph, not a number
  const match = text.match(/\+?[\d][\d\s\-().]{5,}\d/);
  if (!match) return '';
  const plus = match[0].trim().startsWith('+');
  const digits = match[0].replace(/\D/g, '');
  // Indian mobiles are 10 digits; allow 6–15 so landlines and +country work too.
  if (digits.length < 6 || digits.length > 15) return '';
  return (plus ? '+' : '') + digits;
};

// Pretty-print for the suggestion chip only — never for what gets dialled.
const prettyPhone = (n) => {
  const d = n.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return n;
};

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

// Every call must be logged with one of these before the rep can carry on.
const OUTCOMES = [
  { key: 'unreachable',       label: 'Unreachable',       icon: 'cellular-outline',        color: '#6B7280' },
  { key: 'line_busy',         label: 'Line Busy',         icon: 'time-outline',            color: '#F59E0B' },
  { key: 'not_interested',    label: 'Not Interested',    icon: 'close-circle-outline',    color: '#EF4444' },
  { key: 'appointment_fixed', label: 'Appointment Fixed', icon: 'calendar-outline',        color: '#10B981' },
  // Anything that doesn't fit the four above — the reason box is mandatory so
  // "Other" can never be used to skip explaining what happened.
  { key: 'other',             label: 'Other',             icon: 'ellipsis-horizontal-circle-outline', color: '#6366F1' },
  // Escape hatch: the dialler opened but no call was actually placed, so the
  // rep isn't forced to log a false outcome for a misdial.
  { key: 'call_not_placed',   label: 'Call not placed',   icon: 'return-up-back-outline',  color: '#9CA3AF' },
];

// Outcomes that can't be submitted without a written reason.
const REASON_REQUIRED = ['not_interested', 'other'];

export default function DialPadScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');

  // Feedback is driven by "we opened the dialler, then the app came back".
  const dialledRef = useRef(null);      // number we last dialled
  const awaitingRef = useRef(false);    // true between opening the dialler and logging
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Appointment form
  const [form, setForm] = useState({ companyName: '', ownerName: '', address: '', mapLink: '', note: '' });
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Number found on the clipboard, offered as a one-tap paste chip.
  const [clipNumber, setClipNumber] = useState('');
  const dismissedClipRef = useRef('');   // chip the user already closed

  // Read the clipboard and surface a number if there is one worth offering.
  const checkClipboard = async () => {
    try {
      const raw = await Clipboard.getString();
      const found = extractPhone(raw);
      // Don't re-offer what's already typed, or what was dismissed / just dialled.
      if (!found
        || found === dismissedClipRef.current
        || found.replace(/\D/g, '') === number.replace(/\D/g, '')) {
        setClipNumber((prev) => (found ? prev : ''));
        return;
      }
      setClipNumber(found);
    } catch (_) { /* clipboard unavailable — no chip, no error */ }
  };

  // Check whenever the screen is opened…
  useFocusEffect(
    React.useCallback(() => {
      checkClipboard();
      return undefined;
    }, [number])
  );

  // iOS/Android give no reliable "call ended" signal (iOS forbids call-log
  // access outright), so returning to the foreground is our trigger.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (awaitingRef.current) {
        awaitingRef.current = false;
        setFeedbackFor(dialledRef.current);
        return;
      }
      // …and again on return from another app, which is exactly when the user
      // has just copied a number somewhere else.
      checkClipboard();
    });
    return () => sub.remove();
  }, [number]);

  const applyClipNumber = () => {
    setNumber(clipNumber);
    setClipNumber('');
  };

  const dismissClipNumber = () => {
    dismissedClipRef.current = clipNumber;
    setClipNumber('');
  };

  const press = (k) => setNumber((p) => (p.length >= 15 ? p : p + k));
  const backspace = () => setNumber((p) => p.slice(0, -1));

  const call = async () => {
    const n = number.replace(/\s/g, '');
    if (n.replace(/\D/g, '').length < 6) {
      return Alert.alert('Enter a number', 'Please enter a valid phone number to call.');
    }
    dialledRef.current = n;
    awaitingRef.current = true;
    try {
      // `tel:` opens the native dialler — a normal cellular call on the SIM.
      await Linking.openURL(`tel:${n}`);
    } catch (e) {
      awaitingRef.current = false;
      Alert.alert('Could not start the call', 'Your device could not open the dialler.');
    }
  };

  const resetFeedback = () => {
    setFeedbackFor(null); setOutcome(null); setReason('');
    setForm({ companyName: '', ownerName: '', address: '', mapLink: '', note: '' });
    setDate(new Date()); setTime(new Date());
  };

  const submitFeedback = async () => {
    if (!outcome) return Alert.alert('Select an outcome', 'Please choose what happened on this call.');
    if (REASON_REQUIRED.includes(outcome) && !reason.trim()) {
      return Alert.alert(
        'Reason required',
        outcome === 'other'
          ? 'Please describe what happened on this call.'
          : 'Please add why the customer was not interested.',
      );
    }
    if (outcome === 'appointment_fixed' && !form.companyName.trim() && !form.ownerName.trim()) {
      return Alert.alert('Details required', 'Please enter the company or owner name for the appointment.');
    }

    setSaving(true);
    try {
      // Log the call itself for every outcome except a non-call.
      if (outcome !== 'call_not_placed') {
        await callsApi.create({
          phone: feedbackFor,
          clientName: form.companyName.trim() || form.ownerName.trim() || feedbackFor,
          date: new Date(),
          outcome,
          reason: REASON_REQUIRED.includes(outcome) ? reason.trim() : '',
        }).catch(() => {});   // never block the funnel on the call log
      }

      if (outcome === 'appointment_fixed') {
        await callAppointmentsApi.create({
          mobile: feedbackFor,
          companyName: form.companyName.trim(),
          ownerName: form.ownerName.trim(),
          address: form.address.trim(),
          mapLink: form.mapLink.trim(),
          date,
          time: time.toTimeString().slice(0, 5),
          note: form.note.trim(),
        });
        Alert.alert('Appointment sent to HR', 'HR will assign it to a sales person.');
      }

      setNumber('');
      resetFeedback();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isAppt = outcome === 'appointment_fixed';

  return (
    <View style={styles.container}>
      {/* Number display */}
      <View style={styles.display}>
        <Text style={styles.numberText} numberOfLines={1} adjustsFontSizeToFit>
          {number || 'Enter number'}
        </Text>
        {number ? (
          <TouchableOpacity onPress={backspace} onLongPress={() => setNumber('')} style={styles.backBtn}>
            <Ionicons name="backspace-outline" size={26} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          // Manual paste, for when the chip was dismissed or never appeared.
          <TouchableOpacity
            onPress={async () => {
              const found = extractPhone(await Clipboard.getString().catch(() => ''));
              if (!found) return Alert.alert('Nothing to paste', 'No phone number was found on the clipboard.');
              dismissedClipRef.current = '';
              setNumber(found);
              setClipNumber('');
            }}
            style={styles.backBtn}
          >
            <Ionicons name="clipboard-outline" size={24} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Copied a number elsewhere? One tap to drop it into the pad. */}
      {!!clipNumber && (
        <TouchableOpacity style={styles.pasteChip} onPress={applyClipNumber} activeOpacity={0.85}>
          <Ionicons name="clipboard-outline" size={16} color={Theme.colors.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.pasteLabel}>Paste copied number</Text>
            <Text style={styles.pasteNumber}>{prettyPhone(clipNumber)}</Text>
          </View>
          <TouchableOpacity
            onPress={dismissClipNumber}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map(([k, sub]) => (
          <TouchableOpacity key={k} style={styles.key} onPress={() => press(k)} activeOpacity={0.6}>
            <Text style={styles.keyNum}>{k}</Text>
            {!!sub && <Text style={styles.keySub}>{sub}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.callBtn, { marginBottom: Math.max(insets.bottom, 12) + 70 }]} onPress={call}>
        <Ionicons name="call" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Mandatory post-call feedback */}
      <Modal visible={!!feedbackFor} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>How did the call go?</Text>
            <Text style={styles.sheetSub}>{feedbackFor}</Text>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
              {OUTCOMES.map((o) => {
                const on = outcome === o.key;
                return (
                  <TouchableOpacity key={o.key} style={[styles.outcome, on && { borderColor: o.color, backgroundColor: o.color + '12' }]} onPress={() => setOutcome(o.key)}>
                    <Ionicons name={o.icon} size={20} color={o.color} />
                    <Text style={[styles.outcomeText, on && { color: o.color, fontWeight: '800' }]}>{o.label}</Text>
                    {on && <Ionicons name="checkmark-circle" size={20} color={o.color} />}
                  </TouchableOpacity>
                );
              })}

              {REASON_REQUIRED.includes(outcome) && (
                <>
                  <Text style={styles.label}>Reason *</Text>
                  <TextInput
                    style={[styles.input, styles.textarea]}
                    placeholder={outcome === 'other'
                      ? 'What happened on this call?'
                      : 'Why were they not interested?'}
                    placeholderTextColor={Theme.colors.textSecondary}
                    value={reason} onChangeText={setReason} multiline
                  />
                </>
              )}

              {isAppt && (
                <>
                  <View style={styles.autoBox}>
                    <Text style={styles.autoLine}>Lead source: <Text style={styles.autoVal}>{user?.name || '—'}</Text></Text>
                    <Text style={styles.autoLine}>Mobile no: <Text style={styles.autoVal}>{feedbackFor}</Text></Text>
                  </View>

                  <Text style={styles.label}>Lead company name</Text>
                  <TextInput style={styles.input} value={form.companyName} onChangeText={(v) => setF('companyName', v)}
                    placeholder="e.g. Chhatrapati Developers" placeholderTextColor={Theme.colors.textSecondary} />

                  <Text style={styles.label}>Owner name</Text>
                  <TextInput style={styles.input} value={form.ownerName} onChangeText={(v) => setF('ownerName', v)}
                    placeholder="e.g. Aryash Pardhi" placeholderTextColor={Theme.colors.textSecondary} />

                  <Text style={styles.label}>Address</Text>
                  <TextInput style={[styles.input, styles.textarea]} value={form.address} onChangeText={(v) => setF('address', v)}
                    placeholder="Full address" placeholderTextColor={Theme.colors.textSecondary} multiline />

                  <Text style={styles.label}>Google map link</Text>
                  <TextInput style={styles.input} value={form.mapLink} onChangeText={(v) => setF('mapLink', v)}
                    autoCapitalize="none" placeholder="https://…" placeholderTextColor={Theme.colors.textSecondary} />

                  <View style={styles.row2}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Date</Text>
                      <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
                        <Text style={styles.inputText}>{date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Time</Text>
                      <TouchableOpacity style={styles.input} onPress={() => setShowTime(true)}>
                        <Text style={styles.inputText}>{time.toTimeString().slice(0, 5)}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {showDate && (
                    <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(e, d) => { setShowDate(false); if (e?.type !== 'dismissed' && d) setDate(d); }} />
                  )}
                  {showTime && (
                    <DateTimePicker value={time} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(e, d) => { setShowTime(false); if (e?.type !== 'dismissed' && d) setTime(d); }} />
                  )}

                  <Text style={styles.label}>Note</Text>
                  <TextInput style={[styles.input, styles.textarea]} value={form.note} onChangeText={(v) => setF('note', v)}
                    placeholder="e.g. available till 1:50, call the client before reaching"
                    placeholderTextColor={Theme.colors.textSecondary} multiline />
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={submitFeedback} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{isAppt ? 'Send to HR' : 'Save'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'flex-end' },
  display: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingVertical: 22, paddingHorizontal: 20 },
  numberText: { flex: 1, textAlign: 'center', fontFamily: Theme.typography.fontFamily, fontSize: 32, fontWeight: '700', color: Theme.colors.text, letterSpacing: 1 },
  backBtn: { padding: 6 },
  pasteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '88%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
  },
  pasteLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  pasteNumber: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: '600',
    color: Theme.colors.text,
    letterSpacing: 0.5,
  },
  pad: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24 },
  key: { width: '33.33%', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  keyNum: { fontFamily: Theme.typography.fontFamily, fontSize: 30, fontWeight: '500', color: Theme.colors.text },
  keySub: { fontFamily: Theme.typography.fontFamily, fontSize: 10, letterSpacing: 1.5, color: Theme.colors.textSecondary, marginTop: -2 },
  callBtn: { alignSelf: 'center', width: 66, height: 66, borderRadius: 33, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginTop: 8, elevation: 4 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 26 },
  sheetTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  sheetSub: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginBottom: 12 },
  outcome: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: Theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  outcomeText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '600', color: Theme.colors.text },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 12, paddingVertical: 11, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  inputText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  textarea: { height: 74, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 12 },
  autoBox: { backgroundColor: Theme.colors.primary + '10', borderRadius: 10, padding: 12, marginTop: 12 },
  autoLine: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginVertical: 1 },
  autoVal: { fontWeight: '800', color: Theme.colors.text },
  submitBtn: { backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  submitText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
});
