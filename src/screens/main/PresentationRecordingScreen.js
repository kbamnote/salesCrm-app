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
  const [webViewKey, setWebViewKey] = useState(0);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const isPreparingRef = useRef(false);
  const recordingRef = useRef(null);
  const recordingUriRef = useRef(null);

  // Store latest handleEndPresentation in a ref to avoid stale closures in useEffect
  const handleEndPresentationRef = useRef();

  // Prevent back navigation without saving
  useEffect(() => {
    // Show standard back button but intercept it
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // If we are already processing, or if this is a dispatch we triggered (like reset), let it go
      if (e.data.action.type !== 'GO_BACK') return;
      
      e.preventDefault();
      if (handleEndPresentationRef.current) {
        handleEndPresentationRef.current();
      }
    });

    const backAction = () => {
      if (handleEndPresentationRef.current) {
        handleEndPresentationRef.current();
      }
      return true; // Prevent default behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    
    return () => {
      unsubscribe();
      backHandler.remove();
    };
  }, [navigation]);

  // Start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopRecordingAndCleanup(true);
    };
  }, []);

  const startRecording = async () => {
    if (isPreparingRef.current) return;
    isPreparingRef.current = true;
    try {
      console.log('Requesting permissions..');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // Crucial for background recording
      });

      console.log('Starting recording..');
      let newRecording;
      try {
        const result = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        newRecording = result.recording;
      } catch (createErr) {
        if (createErr.message && createErr.message.includes('Only one Recording object')) {
          console.log('Previous recording still unloading, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 800));
          const result = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
          newRecording = result.recording;
        } else {
          throw createErr;
        }
      }

      recordingRef.current = newRecording;
      setRecording(newRecording);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start Timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please ensure microphone permissions are granted.', [
        { text: 'Go Back', onPress: () => navigation.navigate('Root', { screen: 'PresentationHistory' }) }
      ]);
    } finally {
      isPreparingRef.current = false;
    }
  };

  const stopRecordingAndCleanup = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    const rec = recordingRef.current || recording;
    if (rec) {
      try {
        const uri = rec.getURI();
        if (uri) recordingUriRef.current = uri;

        await rec.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });
      } catch (e) {
        if (!e.message?.includes('already been unloaded')) {
          console.error('Error stopping recording:', e);
        }
      }
    }
    
    setRecording(null);
    recordingRef.current = null;
    setIsRecording(false);
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
          onPress: () => doEndAndSave()
        }
      ]
    );
  };

  const goToHistory = () => {
    navigation.reset({
      index: 0,
      routes: [{
        name: 'Root',
        state: { routes: [{ name: 'PresentationHistory' }], index: 0 },
      }],
    });
  };

  const doEndAndSave = async () => {
    setIsProcessing(true);
    await stopRecordingAndCleanup(false);

    const uri = recordingUriRef.current;
    if (!uri) {
      setIsProcessing(false);
      Alert.alert('Error', 'No recording was found to save.');
      return;
    }

    const finalDuration = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : duration;

    // Everything needed to upload+save, packaged so it can be retried/queued.
    const item = {
      localAudioUri: uri,
      selfieUri: presentationData?.selfieUri,
      duration: finalDuration,
      metadata: presentationData,
    };

    try {
      await presentationService.submitPresentation(item);
      setIsProcessing(false);
      Alert.alert('Success', 'Presentation recorded and saved successfully.', [
        { text: 'OK', onPress: goToHistory },
      ]);
    } catch (error) {
      // submitPresentation already saved it to the local retry queue — it is NOT lost.
      setIsProcessing(false);
      console.error(error);
      Alert.alert(
        'Saved — will upload when online',
        'We couldn\'t reach the server, so your recording has been saved on this device and will upload automatically when your connection is back. You can also retry now.',
        [
          { text: 'Retry now', onPress: () => doEndAndSave() },
          { text: 'OK', onPress: goToHistory },
        ]
      );
    }
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

  handleEndPresentationRef.current = handleEndPresentation;

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
  
  // Use Microsoft Office Viewer for better PPT support, fallback to Google Docs for PDFs
  const isPpt = pptUrl?.toLowerCase().includes('.ppt');
  const webViewUrl = pptUrl 
    ? (isPpt 
        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptUrl)}`
        : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pptUrl)}`)
    : null;

  return (
    <View style={styles.container}>
      {/* PPT Viewer Section */}
      <View style={styles.viewerContainer}>
        {webViewUrl ? (
          <View style={{ flex: 1 }}>
            <WebView 
              key={webViewKey}
              source={{ uri: webViewUrl }} 
              style={{ flex: 1 }} 
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webviewLoader}>
                  <ActivityIndicator size="large" color={Theme.colors.primary} />
                  <Text style={{ marginTop: 8 }}>Loading Presentation...</Text>
                </View>
              )}
              onError={() => setWebViewKey(prev => prev + 1)}
              onHttpError={() => setWebViewKey(prev => prev + 1)}
            />
            <TouchableOpacity 
              style={styles.reloadBtn} 
              onPress={() => setWebViewKey(prev => prev + 1)}
            >
              <Ionicons name="refresh" size={20} color={Theme.colors.white || '#fff'} />
              <Text style={styles.reloadText}>Reload</Text>
            </TouchableOpacity>
          </View>
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
  reloadBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  reloadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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
