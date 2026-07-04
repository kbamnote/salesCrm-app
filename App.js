import 'react-native-gesture-handler';
import React, { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import AnimatedSplash from './src/components/AnimatedSplash';

// Expo Google Fonts for Roboto
// If you face issues, ensure you run: npx expo install expo-font @expo-google-fonts/roboto
import { useFonts, Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { View, Linking } from 'react-native';

// Keep the native splash up until we're ready to hand off to the animated one.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({
    Roboto: Roboto_400Regular,
    Roboto_Medium: Roboto_500Medium,
    Roboto_Bold: Roboto_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);

  // Once fonts are ready, hide the native splash so the animated one takes over.
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Tapping a reel notification opens the Instagram reel directly — works both
  // when the app is running and when it's launched from a terminated state.
  useEffect(() => {
    const openIfReel = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (data.type !== 'reel' || !data.reelUrl) return;
      const id = response?.notification?.request?.identifier || '';
      // Guard against re-opening the same notification on a later cold start.
      const last = await AsyncStorage.getItem('handledReelNotif').catch(() => null);
      if (id && id === last) return;
      if (id) AsyncStorage.setItem('handledReelNotif', id).catch(() => {});
      Linking.openURL(String(data.reelUrl)).catch(() => {});
    };
    const sub = Notifications.addNotificationResponseReceivedListener(openIfReel);
    Notifications.getLastNotificationResponseAsync().then(openIfReel).catch(() => {});
    return () => sub.remove();
  }, []);

  // Hold on the native splash (don't flash anything) until fonts are loaded.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <AuthProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </AuthProvider>
        {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
      </View>
    </SafeAreaProvider>
  );
}
