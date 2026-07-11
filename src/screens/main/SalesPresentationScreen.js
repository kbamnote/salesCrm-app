import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Switch,
  ActivityIndicator, Alert, Linking, ScrollView, RefreshControl, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { salesDecksApi, usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';
const SALES_ROLES = ['sales', 'tms', 'tme']; // who a deck can be assigned to

// Upload a PDF to Cloudinary as a RAW file (raw delivery isn't subject to the
// PDF-image restriction, so the link always opens).
async function uploadPdf(file) {
  const form = new FormData();
  form.append('file', { uri: file.uri, type: file.mimeType || 'application/pdf', name: file.name || 'deck.pdf' });
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
}

export default function SalesPresentationScreen() {
  const { user } = useAuth();
  const canManage = ['admin', 'hr'].includes(user?.role);

  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Upload modal
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);      // { uri, name, mimeType }
  const [title, setTitle] = useState('');
  const [assignAll, setAssignAll] = useState(true);
  const [selected, setSelected] = useState([]); // rep ids
  const [reps, setReps] = useState([]);
  const [repsLoading, setRepsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await salesDecksApi.list();
      setDecks(res.data || []);
    } catch (e) {
      console.log('Error loading decks', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openDeck = (d) => {
    if (d.fileUrl) Linking.openURL(d.fileUrl).catch(() => Alert.alert('Could not open', 'The presentation link seems invalid.'));
  };

  const removeDeck = (d) => {
    Alert.alert('Delete presentation', `"${d.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusyId(d._id);
        try {
          await salesDecksApi.remove(d._id);
          setDecks((prev) => prev.filter((x) => x._id !== d._id));
        } catch (e) { Alert.alert('Error', 'Could not delete.'); } finally { setBusyId(null); }
      } },
    ]);
  };

  // ── Upload flow ──
  const openUpload = () => {
    setFile(null); setTitle(''); setAssignAll(true); setSelected([]);
    setOpen(true);
    if (reps.length === 0) {
      setRepsLoading(true);
      usersApi.contacts()
        .then((r) => setReps((r.data || []).filter((u) => SALES_ROLES.includes(u.role))))
        .catch(() => {})
        .finally(() => setRepsLoading(false));
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const f = res.assets[0];
      setFile(f);
      if (!title.trim()) setTitle((f.name || '').replace(/\.pdf$/i, ''));
    } catch (e) {
      Alert.alert('Error', 'Could not pick a file.');
    }
  };

  const toggleRep = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!file) return Alert.alert('Choose a file', 'Please select a PDF to upload.');
    if (!title.trim()) return Alert.alert('Title', 'Please enter a title.');
    if (!assignAll && selected.length === 0) return Alert.alert('Assign', 'Select at least one salesperson, or turn on "All sales team".');
    setSaving(true);
    try {
      const fileUrl = await uploadPdf(file);
      await salesDecksApi.create({
        title: title.trim(),
        fileUrl,
        fileName: file.name || '',
        assignAll,
        assignedTo: assignAll ? [] : selected,
      });
      setOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload the presentation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const assignmentLabel = (d) => (d.assignAll ? 'All sales team' : `${(d.assignedTo || []).length} assigned`);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      >
        {canManage && (
          <TouchableOpacity style={styles.uploadBtn} onPress={openUpload}>
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Upload Presentation</Text>
          </TouchableOpacity>
        )}

        {decks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="easel-outline" size={52} color={Theme.colors.border} />
            <Text style={styles.emptyTitle}>No presentations yet</Text>
            <Text style={styles.emptyText}>
              {canManage ? 'Tap “Upload Presentation” to add a PDF and assign it to your sales team.' : 'Presentations assigned to you will appear here.'}
            </Text>
          </View>
        ) : (
          decks.map((d) => (
            <View key={d._id} style={styles.card}>
              <View style={styles.cardIcon}><Ionicons name="document-text-outline" size={22} color={Theme.colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{d.title}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {canManage ? assignmentLabel(d) : (d.uploaderName ? `Shared by ${d.uploaderName}` : 'Sales deck')}
                </Text>
              </View>
              <TouchableOpacity style={styles.openBtn} onPress={() => openDeck(d)}>
                <Ionicons name="open-outline" size={16} color="#fff" />
                <Text style={styles.openText}>Open</Text>
              </TouchableOpacity>
              {canManage && (
                <TouchableOpacity style={styles.delBtn} onPress={() => removeDeck(d)} disabled={busyId === d._id}>
                  {busyId === d._id ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="trash-outline" size={18} color="#EF4444" />}
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Upload + assign modal */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => !saving && setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Upload Presentation</Text>
              <TouchableOpacity onPress={() => !saving && setOpen(false)}><Ionicons name="close" size={24} color={Theme.colors.text} /></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.filePick} onPress={pickFile} disabled={saving}>
                <Ionicons name={file ? 'document-text' : 'document-attach-outline'} size={22} color={Theme.colors.primary} />
                <Text style={styles.fileText} numberOfLines={1}>{file ? file.name : 'Choose a PDF file'}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Tapify Sales Pitch 2026"
                placeholderTextColor={Theme.colors.textSecondary}
                editable={!saving}
              />

              <View style={styles.assignRow}>
                <Text style={styles.assignLabel}>Assign to all sales team</Text>
                <Switch value={assignAll} onValueChange={setAssignAll} trackColor={{ true: Theme.colors.primary, false: '#cbd5e1' }} thumbColor="#fff" disabled={saving} />
              </View>

              {!assignAll && (
                <View style={styles.repBox}>
                  <Text style={styles.label}>Select salespeople ({selected.length})</Text>
                  {repsLoading ? (
                    <ActivityIndicator color={Theme.colors.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    <FlatList
                      data={reps}
                      keyExtractor={(u) => String(u._id)}
                      style={{ maxHeight: 220 }}
                      ListEmptyComponent={<Text style={styles.emptyText}>No salespeople found.</Text>}
                      renderItem={({ item }) => {
                        const on = selected.includes(String(item._id));
                        return (
                          <TouchableOpacity style={styles.repRow} onPress={() => toggleRep(String(item._id))}>
                            <View style={[styles.checkbox, on && styles.checkboxOn]}>{on && <Ionicons name="checkmark" size={15} color="#fff" />}</View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.repName}>{item.name}</Text>
                              <Text style={styles.repRole}>{item.role}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  )}
                </View>
              )}

              <TouchableOpacity style={[styles.saveBtn, (saving || !file || !title.trim()) && { opacity: 0.6 }]} onPress={submit} disabled={saving || !file || !title.trim()}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.saveText}>Upload & Assign</Text></>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginBottom: 14,
  },
  uploadBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '800', color: Theme.colors.text },
  cardMeta: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 2 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Theme.colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  openText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: '#fff' },
  delBtn: { padding: 6, marginLeft: 2 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 17, fontWeight: '800', color: Theme.colors.textSecondary, marginTop: 12 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, marginTop: 4, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '85%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  filePick: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC',
    borderWidth: 1.5, borderColor: Theme.colors.border, borderStyle: 'dashed', borderRadius: 12, padding: 14,
  },
  fileText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '600', color: Theme.colors.text },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text,
  },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  assignLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  repBox: { marginTop: 8 },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  repName: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text },
  repRole: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 18,
  },
  saveText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
});
