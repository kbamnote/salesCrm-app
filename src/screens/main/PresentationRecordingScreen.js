import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Theme } from '../../theme/Theme';
import { presentationService } from '../../services/presentationService';

export default function PresentationRecordingScreen({ route, navigation }) {
  const { presentationData } = route.params || {};

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Prevent back navigation
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      gestureEnabled: false,
    });

    const backAction = () => {
      Alert.alert('Recording in Progress', 'Please end the presentation to stop recording and exit.', [
        { text: 'OK', onPress: () => null }
      ]);
      return true; // Prevent default behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);

  // Start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopRecordingAndCleanup(true);
    };
  }, []);

  const startRecording = async () => {
    try {
      console.log('Requesting permissions..');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // Crucial for background recording
      });

      console.log('Starting recording..');
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start Timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please ensure microphone permissions are granted.', [
        { text: 'Go Back', onPress: () => navigation.replace('PresentationHistory') }
      ]);
    }
  };

  const stopRecordingAndCleanup = async (isUnmount = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });
      } catch (e) {
        console.error('Error stopping recording:', e);
      }
    }
    
    if (isUnmount) {
      setRecording(null);
      setIsRecording(false);
    }
  };

  const handleEndPresentation = async () => {
    Alert.alert(
      'End Presentation',
      'Are you sure you want to end and save this presentation?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End & Save', 
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            await stopRecordingAndCleanup(false);
            
            try {
              const uri = recording.getURI();
              const selfieUri = presentationData?.selfieUri;
              
              // Upload audio and image concurrently
              const [audioUrl, selfieUrl] = await Promise.all([
                presentationService.uploadAudio(uri),
                presentationService.uploadImage(selfieUri)
              ]);
              
              // Save metadata
              await presentationService.savePresentation({
                ...presentationData,
                duration: duration,
                audioUrl: audioUrl,
                selfieUrl: selfieUrl,
                localAudioUri: uri,
              });

              setIsProcessing(false);
              Alert.alert('Success', 'Presentation recorded and saved successfully.', [
                { text: 'OK', onPress: () => navigation.replace('PresentationHistory') }
              ]);
            } catch (error) {
              setIsProcessing(false);
              console.error(error);
              Alert.alert('Upload Error', 'Failed to save the presentation. Please ensure you have a stable internet connection.');
            }
          }
        }
      ]
    );
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const hDisplay = h > 0 ? `${h.toString().padStart(2, '0')}:` : '';
    const mDisplay = m.toString().padStart(2, '0');
    const sDisplay = s.toString().padStart(2, '0');
    
    return `${hDisplay}${mDisplay}:${sDisplay}`;
  };

  if (isProcessing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.processingText}>Processing and uploading presentation...</Text>
      </View>
    );
  }

  // Determine URL for WebView
  const pptUrl = presentationData?.pptUrl;
  const webViewUrl = pptUrl 
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pptUrl)}`
    : null;

  return (
    <View style={styles.container}>
      {/* PPT Viewer Section */}
      <View style={styles.viewerContainer}>
        {webViewUrl ? (
          <WebView 
            source={{ uri: webViewUrl }} 
            style={{ flex: 1 }} 
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.webviewLoader}>
                <ActivityIndicator size="large" color={Theme.colors.primary} />
                <Text style={{ marginTop: 8 }}>Loading Presentation...</Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.noPptContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.noPptText}>No Presentation Selected</Text>
            <Text style={styles.customerName}>{presentationData?.customerName}</Text>
          </View>
        )}
      </View>

      {/* Floating Recording Controls at the Bottom */}
      <View style={styles.recordingFooter}>
        <View style={styles.timerRow}>
          <View style={[styles.recordingIndicator, isRecording && styles.recordingActive]} />
          <Text style={styles.timerText}>{formatTime(duration)}</Text>
        </View>

        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEndPresentation}
          disabled={!isRecording}
        >
          <Ionicons name="stop-circle" size={24} color={Theme.colors.white || '#fff'} />
          <Text style={styles.endButtonText}>End & Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Black background for full screen presentation feel
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webviewLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  noPptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.white || '#fff',
  },
  noPptText: {
    fontSize: 18,
    color: Theme.colors.textSecondary || '#666',
    marginTop: 16,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: Theme.colors.text || '#333',
    fontWeight: '500',
  },
  customerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Theme.colors.text || '#333',
    textAlign: 'center',
    marginTop: 8,
  },
  recordingFooter: {
    backgroundColor: Theme.colors.white || '#fff',
    padding: 16,
    paddingBottom: 32, // safe area
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border || '#eee',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordingIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ccc',
  },
  recordingActive: {
    backgroundColor: '#EF4444', // Red for recording
  },
  timerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Theme.colors.text || '#333',
    fontVariant: ['tabular-nums'],
  },
  endButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  endButtonText: {
    color: Theme.colors.white || '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
