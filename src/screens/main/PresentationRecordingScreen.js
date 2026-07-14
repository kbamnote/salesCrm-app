import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler, ActivityIndicator, Linking } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Theme } from '../../theme/Theme';
import { presentationService } from '../../services/presentationService';
import { startRecordingForegroundService, stopRecordingForegroundService } from '../../services/recordingForegroundService';

// Self-contained pdf.js viewer. Renders every page to a scrollable canvas stack.
// Android WebView can't display PDFs natively and Google's gview is unreliable,
// so we fetch + render the PDF ourselves (Cloudinary serves it with CORS *).
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const buildPdfHtml = (url) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4">
<style>
  html,body{margin:0;padding:0;background:#525659;}
  #c{display:flex;flex-direction:column;align-items:center;padding:8px 0;}
  canvas{margin:6px 0;box-shadow:0 1px 5px rgba(0,0,0,.5);background:#fff;}
  #msg{color:#fff;font-family:-apple-system,Roboto,sans-serif;text-align:center;padding:48px 20px;font-size:15px;}
</style>
</head>
<body>
<div id="msg">Loading Presentation…</div>
<div id="c"></div>
<script src="${PDFJS}/pdf.min.js"></script>
<script>
(function(){
  var RN = window.ReactNativeWebView;
  var msg = document.getElementById('msg');
  function fail(){ if(msg){msg.innerText='Could not load the presentation.';} RN && RN.postMessage('error'); }
  try {
    if(!window.pdfjsLib){ return fail(); }
    pdfjsLib.GlobalWorkerOptions.workerSrc='${PDFJS}/pdf.worker.min.js';
    var dpr = window.devicePixelRatio || 1;
    pdfjsLib.getDocument(${JSON.stringify(url)}).promise.then(function(pdf){
      if(msg){ msg.style.display='none'; }
      var cont = document.getElementById('c');
      (function renderPage(n){
        if(n > pdf.numPages){ RN && RN.postMessage('loaded'); return; }
        pdf.getPage(n).then(function(page){
          var avail = document.documentElement.clientWidth - 16;
          var base = page.getViewport({scale:1});
          var vp = page.getViewport({scale:(avail/base.width)*dpr});
          var canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = (vp.width/dpr)+'px';
          cont.appendChild(canvas);
          page.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise.then(function(){ renderPage(n+1); }, fail);
        }, fail);
      })(1);
    }, fail);
  } catch(e){ fail(); }
})();
</script>
</body>
</html>`;

export default function PresentationRecordingScreen({ route, navigation }) {
  const { presentationData } = route.params || {};

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [viewerFailed, setViewerFailed] = useState(false);

  const timerRef = useRef(null);
  // Accumulated recording time model so paused stretches aren't counted.
  const accumulatedMsRef = useRef(0);   // ms banked from finished (un-paused) segments
  const segmentStartRef = useRef(null); // Date.now() when the current live segment began
  const pauseBusyRef = useRef(false);
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

  // Total elapsed recording seconds, excluding paused time.
  const computeElapsedSec = () => {
    const live = segmentStartRef.current ? Date.now() - segmentStartRef.current : 0;
    return Math.floor((accumulatedMsRef.current + live) / 1000);
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration(computeElapsedSec()), 500);
  };

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
      setIsPaused(false);
      accumulatedMsRef.current = 0;
      segmentStartRef.current = Date.now();

      // Keep the mic alive if the salesperson backgrounds the app (Android).
      startRecordingForegroundService();

      startTimer();
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please ensure microphone permissions are granted.', [
        { text: 'Go Back', onPress: () => navigation.navigate('Root', { screen: 'PresentationHistory' }) }
      ]);
    } finally {
      isPreparingRef.current = false;
    }
  };

  const pauseRecording = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      await rec.pauseAsync();
      // Bank the segment that just ended, then stop the ticking clock.
      if (segmentStartRef.current) {
        accumulatedMsRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setDuration(Math.floor(accumulatedMsRef.current / 1000));
      setIsPaused(true);
    } catch (e) {
      console.error('Pause failed', e);
      Alert.alert('Could not pause', 'Recording is still running.');
    }
  };

  const resumeRecording = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      await rec.startAsync();
      segmentStartRef.current = Date.now();
      startTimer();
      setIsPaused(false);
    } catch (e) {
      console.error('Resume failed', e);
      Alert.alert('Could not resume', 'Please try again.');
    }
  };

  const togglePause = async () => {
    if (pauseBusyRef.current || !isRecording) return;
    pauseBusyRef.current = true;
    try {
      if (isPaused) await resumeRecording();
      else await pauseRecording();
    } finally {
      pauseBusyRef.current = false;
    }
  };

  const stopRecordingAndCleanup = async () => {
    // Tear down the background mic service first.
    stopRecordingForegroundService();

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
    setIsPaused(false);
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
    // Capture elapsed (excludes paused time) before cleanup resets the clock.
    const finalDuration = computeElapsedSec() || duration;
    await stopRecordingAndCleanup(false);

    const uri = recordingUriRef.current;
    if (!uri) {
      setIsProcessing(false);
      Alert.alert('Error', 'No recording was found to save.');
      return;
    }

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

  // Determine what the WebView should render.
  const pptUrl = presentationData?.pptUrl;
  const isPpt = pptUrl?.toLowerCase().includes('.ppt');
  // Office docs → Microsoft's embed viewer (uri). PDFs → self-hosted pdf.js (html).
  const webViewSource = pptUrl
    ? (isPpt
        ? { uri: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptUrl)}` }
        : { html: buildPdfHtml(pptUrl), baseUrl: 'https://res.cloudinary.com' })
    : null;

  const reloadViewer = () => { setViewerFailed(false); setWebViewKey(prev => prev + 1); };

  return (
    <View style={styles.container}>
      {/* Presentation Viewer Section */}
      <View style={styles.viewerContainer}>
        {webViewSource ? (
          <View style={{ flex: 1 }}>
            <WebView
              key={webViewKey}
              source={webViewSource}
              originWhitelist={['*']}
              style={{ flex: 1 }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webviewLoader}>
                  <ActivityIndicator size="large" color={Theme.colors.primary} />
                  <Text style={{ marginTop: 8 }}>Loading Presentation...</Text>
                </View>
              )}
              onMessage={(e) => {
                if (e.nativeEvent.data === 'error') setViewerFailed(true);
                else if (e.nativeEvent.data === 'loaded') setViewerFailed(false);
              }}
              onError={() => setViewerFailed(true)}
              onHttpError={() => setViewerFailed(true)}
            />
            {viewerFailed ? (
              <View style={styles.viewerErrorOverlay}>
                <Ionicons name="cloud-offline-outline" size={56} color="#fff" />
                <Text style={styles.viewerErrorText}>Couldn't load the presentation.</Text>
                <View style={styles.viewerErrorBtns}>
                  <TouchableOpacity style={styles.viewerErrorBtn} onPress={reloadViewer}>
                    <Ionicons name="refresh" size={18} color="#fff" />
                    <Text style={styles.reloadText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.viewerErrorBtn}
                    onPress={() => Linking.openURL(pptUrl).catch(() => {})}
                  >
                    <Ionicons name="open-outline" size={18} color="#fff" />
                    <Text style={styles.reloadText}>Open in browser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.reloadBtn} onPress={reloadViewer}>
                <Ionicons name="refresh" size={20} color={Theme.colors.white || '#fff'} />
                <Text style={styles.reloadText}>Reload</Text>
              </TouchableOpacity>
            )}
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
          <View style={[
            styles.recordingIndicator,
            isRecording && !isPaused && styles.recordingActive,
            isPaused && styles.recordingPaused,
          ]} />
          <View>
            <Text style={styles.timerText}>{formatTime(duration)}</Text>
            {isPaused && <Text style={styles.pausedLabel}>Paused</Text>}
          </View>
        </View>

        <View style={styles.footerButtons}>
          <TouchableOpacity
            style={[styles.pauseButton, isPaused && styles.resumeButton]}
            onPress={togglePause}
            disabled={!isRecording}
          >
            <Ionicons name={isPaused ? 'play' : 'pause'} size={22} color={Theme.colors.white || '#fff'} />
            <Text style={styles.pauseButtonText}>{isPaused ? 'Resume' : 'Pause'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endButton}
            onPress={handleEndPresentation}
            disabled={!isRecording}
          >
            <Ionicons name="stop-circle" size={22} color={Theme.colors.white || '#fff'} />
            <Text style={styles.endButtonText}>End & Save</Text>
          </TouchableOpacity>
        </View>
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
  viewerErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#525659',
    paddingHorizontal: 24,
  },
  viewerErrorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  viewerErrorBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  viewerErrorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
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
  recordingPaused: {
    backgroundColor: '#F59E0B', // Amber for paused
  },
  timerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Theme.colors.text || '#333',
    fontVariant: ['tabular-nums'],
  },
  pausedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pauseButton: {
    backgroundColor: '#6B7280',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resumeButton: {
    backgroundColor: '#10B981',
  },
  pauseButtonText: {
    color: Theme.colors.white || '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  endButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  endButtonText: {
    color: Theme.colors.white || '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
