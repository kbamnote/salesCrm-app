import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationsApi } from '../api';

const PUSH_TOKEN_KEY = 'expoPushToken';

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
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4a90e2',
  });
}

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId
  );
}

/**
 * Ask permission, fetch the Expo push token, and register it with the backend
 * for the logged-in user. Safe to call on every login/app-resume — it dedupes
 * server-side. Returns the token (or null if unavailable / denied).
 */
export async function registerForPush() {
  try {
    await ensureAndroidChannel();

    // Push tokens are only issued on physical devices.
    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;
    if (!token) return null;

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    try {
      await notificationsApi.registerToken(token);
    } catch (e) {
      console.log('registerForPush: backend register failed', e?.message || e);
    }
    return token;
  } catch (e) {
    console.log('registerForPush failed', e?.message || e);
    return null;
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
    content: { title: 'Test notification ✅', body: 'If you can see this, notifications work on this device.' },
    trigger: null, // immediately
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
