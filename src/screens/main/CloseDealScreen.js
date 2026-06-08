import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clientsApi, dealsApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function CloseDealScreen({ navigation }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await clientsApi.list();
        setClients(res.data || []);
      } catch (e) {
        console.log('Error loading clients', e);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!selectedClient) return Alert.alert('Select client', 'Please choose the client for this deal.');
    const value = Number(amount);
    if (!value || value <= 0) return Alert.alert('Enter amount', 'Please enter a valid deal amount.');

    setSubmitting(true);
    try {
      await dealsApi.close({
        clientId: selectedClient._id,
        clientName: selectedClient.name,
        amount: value,
        notes: notes.trim(),
      });
      Alert.alert('🎉 Deal Closed!', 'Your deal has been recorded and the team has been notified.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to record the deal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Theme.spacing.l }}>
      <Text style={styles.label}>Client</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setPickerOpen(true)}>
        <Text style={[styles.selectText, !selectedClient && styles.placeholder]}>
          {selectedClient ? selectedClient.name : 'Select a client…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Theme.colors.textSecondary} />
      </TouchableOpacity>

      <Text style={styles.label}>Deal Amount (₹)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 50000"
        placeholderTextColor={Theme.colors.textSecondary}
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Any details about the deal..."
        placeholderTextColor={Theme.colors.textSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.submitText}>Close Deal</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Client picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Client</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>
            {loadingClients ? (
              <ActivityIndicator color={Theme.colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={clients}
                keyExtractor={(item, i) => item._id || String(i)}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                ListEmptyComponent={<Text style={styles.emptyText}>No clients found</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.clientRow}
                    onPress={() => { setSelectedClient(item); setPickerOpen(false); }}
                  >
                    <Text style={styles.clientName}>{item.name}</Text>
                    {item.company ? <Text style={styles.clientCompany}>{item.company}</Text> : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  label: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginBottom: 6,
    marginTop: Theme.spacing.m,
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: Theme.borderRadius.m,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text },
  placeholder: { color: Theme.colors.textSecondary },
  input: {
    backgroundColor: '#fff',
    borderRadius: Theme.borderRadius.m,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  textarea: { height: 90, textAlignVertical: 'top' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.colors.success,
    borderRadius: Theme.borderRadius.m,
    paddingVertical: 16,
    marginTop: Theme.spacing.xl,
  },
  submitText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.spacing.l, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  modalTitle: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.l, fontWeight: Theme.typography.weights.bold, color: Theme.colors.text },
  clientRow: { paddingHorizontal: Theme.spacing.l, paddingVertical: 14 },
  clientName: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, color: Theme.colors.text, fontWeight: Theme.typography.weights.medium },
  clientCompany: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.xs, color: Theme.colors.textSecondary, marginTop: 2 },
  sep: { height: 1, backgroundColor: Theme.colors.border, marginLeft: Theme.spacing.l },
  emptyText: { textAlign: 'center', color: Theme.colors.textSecondary, padding: 30, fontFamily: Theme.typography.fontFamily },
});
