import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking, Platform, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { appConfigApi } from '../api';
import { Theme } from '../theme/Theme';

// Compare dotted version strings numerically: returns -1/0/1 (a<b / == / a>b).
function cmpVersion(a = '', b = '') {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

const currentVersion = Constants.expoConfig?.version || Constants.manifest?.version || '0.0.0';

/**
 * Checks the backend for the latest published version and, if this build is
 * older, shows an "update available" popup that opens the Play Store.
 * If the build is below the backend's minVersion, the popup is mandatory
 * (can't be dismissed). Renders nothing when up to date.
 */
export default function UpdateChecker() {
  const [visible, setVisible] = useState(false);
  const [forced, setForced] = useState(false);
  const [storeUrl, setStoreUrl] = useState(null);
  const [pkg, setPkg] = useState(null);
  const checkedRef = useRef(false);

  const runCheck = async () => {
    if (checkedRef.current) return; // once per app session
    try {
      const { data } = await appConfigApi.get();
      const cfg = data?.android;
      if (!cfg?.latestVersion) return;
      checkedRef.current = true;

      const outdated = cmpVersion(currentVersion, cfg.latestVersion) < 0;
      if (!outdated) return;

      setStoreUrl(cfg.storeUrl || null);
      setPkg(cfg.packageName || null);
      setForced(cfg.minVersion ? cmpVersion(currentVersion, cfg.minVersion) < 0 : false);
      setVisible(true);
    } catch (_) { /* silent — never block the app on a version check */ }
  };

  useEffect(() => {
    runCheck();
    // Re-check when the app returns to the foreground (in case it was left open).
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') runCheck(); });
    return () => sub.remove();
  }, []);

  const openStore = async () => {
    // Prefer the native Play Store app; fall back to the web URL.
    const market = pkg ? `market://details?id=${pkg}` : null;
    try {
      if (Platform.OS === 'android' && market && (await Linking.canOpenURL(market))) {
        await Linking.openURL(market);
        return;
      }
    } catch (_) { /* fall through */ }
    if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!forced) setVisible(false); }}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="rocket-outline" size={30} color={Theme.colors.primary} />
          </View>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.body}>
            {forced
              ? 'A newer version of Tapify Sales CRM is required to continue. Please update to keep using the app.'
              : 'A newer version of Tapify Sales CRM is available with improvements and fixes. Update now for the best experience.'}
          </Text>

          <TouchableOpacity style={styles.updateBtn} onPress={openStore}>
            <Ionicons name="logo-google-playstore" size={18} color="#fff" />
            <Text style={styles.updateBtnText}>Update Now</Text>
          </TouchableOpacity>

          {!forced && (
            <TouchableOpacity style={styles.laterBtn} onPress={() => setVisible(false)}>
              <Text style={styles.laterBtnText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 18, padding: 24, alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: Theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: Theme.typography.fontFamily, fontSize: 19, fontWeight: '800', color: Theme.colors.text },
  body: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 20 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 14, width: '100%' },
  updateBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },
  laterBtn: { paddingVertical: 12, marginTop: 4 },
  laterBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '600', color: Theme.colors.textSecondary },
});
