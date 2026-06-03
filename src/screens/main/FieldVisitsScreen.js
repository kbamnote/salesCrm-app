import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fieldVisitsApi, clientsApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function FieldVisitsScreen() {
  const [visits, setVisits] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Form state
  const [selectedClient, setSelectedClient] = useState(null);
  const [notes, setNotes] = useState('');
  const [purpose, setPurpose] = useState('');
  const [currentCoords, setCurrentCoords] = useState(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const requestPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(status === 'granted');
  };

  const loadData = async () => {
    try {
      const [visitsRes, clientsRes] = await Promise.allSettled([
        fieldVisitsApi.list(),
        clientsApi.list(),
      ]);
      if (visitsRes.status === 'fulfilled') setVisits(visitsRes.value.data || []);
      if (clientsRes.status === 'fulfilled') setClients(clientsRes.value.data || []);
    } catch (e) {
      console.log('Error loading field visits', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const openLogModal = async () => {
    setShowModal(true);
    setFetchingLocation(true);
    setNotes('');
    setPurpose('');
    setSelectedClient(null);
    setCurrentCoords(null);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      Alert.alert('Location Error', 'Could not get your location. Make sure GPS is enabled.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClient) {
      Alert.alert('Validation', 'Please select a client for this visit.');
      return;
    }
    if (!currentCoords) {
      Alert.alert('Location Required', 'Location is required to log a field visit.');
      return;
    }
    setSubmitting(true);
    try {
      await fieldVisitsApi.create({
        clientId: selectedClient._id,
        clientName: selectedClient.name,
        notes,
        purpose,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
      });
      setShowModal(false);
      Alert.alert('✅ Visit Logged!', `Field visit for ${selectedClient.name} has been recorded.`);
      loadData();
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to log visit. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderVisit = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Ionicons name="location" size={22} color={Theme.colors.success} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.clientName}>{item.clientName || 'Unknown Client'}</Text>
          <Text style={styles.visitTime}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <View style={styles.gpsBadge}>
          <Ionicons name="navigate-circle" size={14} color="#065F46" />
          <Text style={styles.gpsBadgeText}>GPS</Text>
        </View>
      </View>
      {item.purpose ? (
        <View style={styles.purposeRow}>
          <Ionicons name="flag-outline" size={14} color={Theme.colors.primary} />
          <Text style={styles.purposeText}>{item.purpose}</Text>
        </View>
      ) : null}
      {item.notes ? (
        <Text style={styles.notesText}>{item.notes}</Text>
      ) : null}
      {item.lat && (
        <View style={styles.coordRow}>
          <Ionicons name="location-outline" size={12} color={Theme.colors.textSecondary} />
          <Text style={styles.coordText}>{parseFloat(item.lat).toFixed(4)}, {parseFloat(item.lng).toFixed(4)}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={visits}
        keyExtractor={(item, i) => item._id || String(i)}
        renderItem={renderVisit}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Theme.colors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Field Visits</Text>
            <Text style={styles.headerSub}>{visits.length} visit{visits.length !== 1 ? 's' : ''} recorded</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={56} color={Theme.colors.border} />
            <Text style={styles.emptyTitle}>No visits yet</Text>
            <Text style={styles.emptyText}>Tap the + button to log a field visit</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openLogModal}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Log Visit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Field Visit</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Location status */}
            <View style={[styles.locationStatus, currentCoords ? styles.locationOk : styles.locationPending]}>
              <Ionicons
                name={fetchingLocation ? 'hourglass-outline' : currentCoords ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={fetchingLocation ? '#92400E' : currentCoords ? '#065F46' : '#991B1B'}
              />
              <Text style={[styles.locationStatusText, { color: fetchingLocation ? '#92400E' : currentCoords ? '#065F46' : '#991B1B' }]}>
                {fetchingLocation ? 'Getting your location...' : currentCoords ? `📍 Location captured (${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)})` : 'Location unavailable'}
              </Text>
            </View>

            {/* Client selector */}
            <Text style={styles.label}>Select Client *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowClientDropdown(!showClientDropdown)}
            >
              <Text style={[styles.selectorText, !selectedClient && styles.placeholder]}>
                {selectedClient ? selectedClient.name : 'Choose a client...'}
              </Text>
              <Ionicons name={showClientDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.colors.textSecondary} />
            </TouchableOpacity>

            {showClientDropdown && (
              <View style={styles.dropdown}>
                {clients.map((c) => (
                  <TouchableOpacity
                    key={c._id}
                    style={styles.dropdownItem}
                    onPress={() => { setSelectedClient(c); setShowClientDropdown(false); }}
                  >
                    <Text style={styles.dropdownText}>{c.name}</Text>
                    {c.city ? <Text style={styles.dropdownSub}>{c.city}</Text> : null}
                  </TouchableOpacity>
                ))}
                {clients.length === 0 && <Text style={styles.dropdownEmpty}>No clients found</Text>}
              </View>
            )}

            <Text style={styles.label}>Purpose of Visit</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Product demo, Follow up, Collection..."
              placeholderTextColor={Theme.colors.textSecondary}
              value={purpose}
              onChangeText={setPurpose}
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Observations, feedback, outcomes..."
              placeholderTextColor={Theme.colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || !currentCoords) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !currentCoords}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>Log Visit</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 100 },
  header: {
    padding: Theme.spacing.l,
    backgroundColor: Theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  headerTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  headerSub: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.m,
    marginTop: Theme.spacing.m,
    borderRadius: Theme.borderRadius.l,
    padding: Theme.spacing.m,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.m,
  },
  cardContent: { flex: 1 },
  clientName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  visitTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  gpsBadgeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: Theme.typography.weights.bold,
    color: '#065F46',
  },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  purposeText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.primary,
    fontWeight: Theme.typography.weights.medium,
  },
  notesText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  coordRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  coordText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
  },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Theme.spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    backgroundColor: Theme.colors.white,
  },
  modalTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  modalBody: { flex: 1, backgroundColor: Theme.colors.surface, padding: Theme.spacing.m },
  locationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Theme.spacing.m,
    borderRadius: Theme.borderRadius.m,
    marginBottom: Theme.spacing.m,
    gap: 8,
  },
  locationOk: { backgroundColor: '#D1FAE5' },
  locationPending: { backgroundColor: '#FEF3C7' },
  locationStatusText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    flex: 1,
  },
  label: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    marginBottom: 6,
    marginTop: Theme.spacing.m,
  },
  input: {
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  textArea: { height: 100, paddingTop: Theme.spacing.m },
  selector: {
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  placeholder: { color: Theme.colors.textSecondary },
  dropdown: {
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    marginTop: 4,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: Theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  dropdownText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
  },
  dropdownSub: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  dropdownEmpty: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    padding: Theme.spacing.m,
    textAlign: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.primary,
    marginTop: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: { backgroundColor: Theme.colors.textSecondary },
  submitBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
});
