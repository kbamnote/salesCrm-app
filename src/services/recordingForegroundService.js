/**
 * Android microphone foreground service for presentation recording.
 *
 * expo-av does NOT start a foreground service, so on Android 12+ the OS mutes
 * the mic shortly after the app is backgrounded (Home button). To keep recording
 * alive we run a Notifee foreground service of type `microphone` (declared in the
 * manifest via plugins/withNotifeeMicrophoneService.js) while a recording is in
 * progress. A persistent "Recording…" notification is shown, as Android requires.
 *
 * iOS keeps recording in the background via UIBackgroundModes: ["audio"] +
 * staysActiveInBackground, so all functions here no-op on iOS.
 */
import { Platform } from 'react-native';
import notifee, { AndroidForegroundServiceType, AndroidImportance } from '@notifee/react-native';

const NOTIFICATION_ID = 'presentation-recording';
const CHANNEL_ID = 'presentation-recording';

let channelId = null;
let serviceRunning = false;

// Must be called once at app startup (index.js), before the service is started.
// Notifee errors if a foreground-service notification is shown without a
// registered task. The task stays alive until stopForegroundService() is called.
export function registerRecordingForegroundService() {
  if (Platform.OS !== 'android') return;
  notifee.registerForegroundService(() => new Promise(() => {}));
}

async function ensureChannel() {
  if (channelId) return channelId;
  channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Presentation Recording',
    importance: AndroidImportance.LOW,
  });
  return channelId;
}

export async function startRecordingForegroundService() {
  if (Platform.OS !== 'android' || serviceRunning) return;
  try {
    const ch = await ensureChannel();
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: 'Recording presentation',
      body: 'Audio is recording — keep this running until you finish.',
      android: {
        channelId: ch,
        asForegroundService: true,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE],
        ongoing: true,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    });
    serviceRunning = true;
  } catch (e) {
    // If the service can't start, recording still works while the app is
    // foregrounded — just not in the background. Don't crash the flow.
    console.warn('Failed to start recording foreground service', e);
  }
}

export async function stopRecordingForegroundService() {
  if (Platform.OS !== 'android') return;
  try { await notifee.stopForegroundService(); } catch (_) {}
  try { await notifee.cancelNotification(NOTIFICATION_ID); } catch (_) {}
  serviceRunning = false;
}
