import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationsApi } from '../api';

const PUSH_TOKEN_KEY = 'expoPushToken';

// Android notification channels. Use FRESH ids (…-v2 / deal) so the custom
// sounds take effect even on devices that already had the old 'default' channel
// — Android ignores sound changes to an existing channel.
// NOTE: these ids MUST match the channelId the backend sends (see push.js).
export const CHANNEL_DEFAULT = 'default_v2';
export const CHANNEL_DEAL = 'deal';

// Show notifications while the app is foregrounded too. (Set once at import.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  // General notifications → notification_sound.mp3
  await Notifications.setNotificationChannelAsync(CHANNEL_DEFAULT, {
    name: 'General Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'notification_sound.mp3',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4a90e2',
  });
  // Deal-closed celebration → clap.mp3
  await Notifications.setNotificationChannelAsync(CHANNEL_DEAL, {
    name: 'Deal Closed',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'clap.mp3',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#10B981',
  });
}

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    Constants?.manifest2?.extra?.eas?.projectId ??
    Constants?.manifest?.extra?.eas?.projectId
  );
}

/**
 * Ask permission, fetch the Expo push token, and register it with the backend.
 * Returns { token, error } — token is null on failure, error describes why.
 */
export async function registerForPush() {
  try {
    await ensureAndroidChannel();

    if (!Device.isDevice) {
      return { token: null, error: 'not-a-device' };
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      return { token: null, error: 'permission-denied' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.log('[Push] No EAS projectId found in Constants');
      return { token: null, error: 'no-project-id' };
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData?.data;
    if (!token) {
      return { token: null, error: 'empty-token' };
    }

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    try {
      await notificationsApi.registerToken(token);
    } catch (e) {
      console.log('[Push] backend register failed:', e?.message || e);
    }
    return { token, error: null };
  } catch (e) {
    const msg = e?.message || String(e);
    console.log('[Push] registerForPush failed:', msg);
    return { token: null, error: msg };
  }
}

/** The Expo push token stored on this device (for diagnostics). */
export async function getStoredPushToken() {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

/**
 * Fire a LOCAL notification immediately. This bypasses the server + FCM, so it
 * verifies only that notification permission + the Android channel work. If this
 * shows but server pushes don't, the problem is delivery (token/backend/FCM),
 * not the app's ability to display notifications.
 */
export async function sendLocalTestNotification() {
  await ensureAndroidChannel();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') return { ok: false, reason: 'permission-denied' };
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test notification ✅',
      body: 'If you can see this, notifications work on this device.',
      sound: 'notification_sound.mp3',
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_DEFAULT } : null,
  });
  return { ok: true };
}

/** Detach this device's token from the user (call on logout). */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await notificationsApi.removeToken(token).catch(() => {});
    }
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch (e) {
    console.log('unregisterPush failed', e?.message || e);
  }
}
