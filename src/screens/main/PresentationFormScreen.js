import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/Theme';
import { useAuth } from '../../context/AuthContext';

export default function PresentationFormScreen({ navigation }) {
  const [formData, setFormData] = useState({
    customerName: '',
    customerMobile: '',
    customerCompany: '',
    notes: '',
  });
  const [location, setLocation] = useState(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [selfieUri, setSelfieUri] = useState(null);
  const { user } = useAuth();
  
  // Auto-select the first PPT if available
  const [selectedPptUrl, setSelectedPptUrl] = useState(user?.ppts?.[0]?.url || null);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    setFetchingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied');
        setFetchingLocation(false);
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch location. Please ensure location services are enabled.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to take a selfie.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        setSelfieUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const handleStart = () => {
    if (!formData.customerName.trim()) {
      Alert.alert('Validation Error', 'Customer Name is required');
      return;
    }

    if (!location) {
      Alert.alert(
        'Location Required',
        'We need your location to start the presentation. Try fetching it again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: getLocation },
        ]
      );
      return;
    }

    if (!selfieUri) {
      Alert.alert('Selfie Required', 'Please take a selfie before starting the presentation.');
      return;
    }

    navigation.replace('PresentationRecording', {
      presentationData: {
        ...formData,
        location,
        selfieUri,
        pptUrl: selectedPptUrl
      },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Customer Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter customer name"
          value={formData.customerName}
          onChangeText={(text) => setFormData({ ...formData, customerName: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Mobile Number (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter mobile number"
          keyboardType="phone-pad"
          value={formData.customerMobile}
          onChangeText={(text) => setFormData({ ...formData, customerMobile: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Company Name (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter company name"
          value={formData.customerCompany}
          onChangeText={(text) => setFormData({ ...formData, customerCompany: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Enter any notes"
          multiline
          numberOfLines={4}
          value={formData.notes}
          onChangeText={(text) => setFormData({ ...formData, notes: text })}
        />
      </View>

      {user?.ppts && user.ppts.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Material to Present</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {user.ppts.map((ppt) => {
              const isSelected = selectedPptUrl === ppt.url;
              return (
                <TouchableOpacity
                  key={ppt._id}
                  style={[
                    styles.pptSelectorCard,
                    isSelected && styles.pptSelectorCardActive
                  ]}
                  onPress={() => setSelectedPptUrl(ppt.url)}
                  activeOpacity={0.8}
                >
                  {/* Checkmark badge in top-right corner when selected */}
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                  <Ionicons
                    name="document-text"
                    size={28}
                    color={isSelected ? Theme.colors.white : Theme.colors.primary}
                    style={{ marginBottom: 6 }}
                  />
                  <Text style={[
                    styles.pptTitle,
                    isSelected && { color: Theme.colors.white, fontWeight: '700' }
                  ]} numberOfLines={2}>
                    {ppt.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected confirmation row */}
          {selectedPptUrl ? (
            <View style={styles.selectedConfirm}>
              <Ionicons name="checkmark-circle" size={18} color={Theme.colors.success} />
              <Text style={styles.selectedConfirmText}>
                Selected: <Text style={{ fontWeight: '700' }}>
                  {user.ppts.find(p => p.url === selectedPptUrl)?.title || 'Material'}
                </Text>
              </Text>
            </View>
          ) : (
            <View style={styles.selectedConfirm}>
              <Ionicons name="alert-circle-outline" size={18} color={Theme.colors.textSecondary} />
              <Text style={[styles.selectedConfirmText, { color: Theme.colors.textSecondary }]}>
                No material selected (optional)
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.locationContainer}>
        <Text style={styles.label}>Selfie Verification *</Text>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          {selfieUri ? (
            <Image source={{ uri: selfieUri }} style={styles.selfiePreview} />
          ) : (
            <View style={styles.selfiePlaceholder}>
              <Ionicons name="person-outline" size={48} color="#ccc" />
            </View>
          )}
          <TouchableOpacity style={styles.selfieButton} onPress={takeSelfie}>
            <Ionicons name="camera" size={20} color={Theme.colors.white} />
            <Text style={styles.selfieButtonText}>
              {selfieUri ? 'Retake Selfie' : 'Take Selfie'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.locationContainer}>
        <Text style={styles.label}>Current Location:</Text>
        {fetchingLocation ? (
          <View style={styles.locationRow}>
            <ActivityIndicator size="small" color={Theme.colors.primary} />
            <Text style={styles.locationText}>Fetching...</Text>
          </View>
        ) : location ? (
          <Text style={styles.locationText}>
            Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
          </Text>
        ) : (
          <TouchableOpacity onPress={getLocation}>
            <Text style={styles.retryText}>Retry fetching location</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.startButton}
        onPress={handleStart}
      >
        <Text style={styles.startButtonText}>Start Presentation</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.surface || '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.colors.text || '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.colors.white || '#fff',
    borderWidth: 1,
    borderColor: Theme.colors.border || '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Theme.colors.text || '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  locationContainer: {
    backgroundColor: Theme.colors.white || '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.colors.border || '#ccc',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  locationText: {
    fontSize: 14,
    color: Theme.colors.textSecondary || '#666',
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    color: Theme.colors.primary || '#3B82F6',
    marginTop: 4,
    fontWeight: 'bold',
  },
  startButton: {
    backgroundColor: Theme.colors.primary || '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 30,
  },
  startButtonText: {
    color: Theme.colors.white || '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pptSelectorCard: {
    width: 120,
    height: 100,
    backgroundColor: Theme.colors.white || '#fff',
    borderWidth: 2,
    borderColor: Theme.colors.border || '#ccc',
    borderRadius: 10,
    marginRight: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pptSelectorCardActive: {
    backgroundColor: Theme.colors.primary || '#3B82F6',
    borderColor: Theme.colors.primary || '#3B82F6',
    elevation: 4,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
    paddingHorizontal: 4,
  },
  selectedConfirmText: {
    fontSize: 13,
    color: Theme.colors.success,
  },
  pptTitle: {
    fontSize: 12,
    textAlign: 'center',
    color: Theme.colors.text || '#333',
  },
  selfiePreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  selfiePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selfieButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
  },
  selfieButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
