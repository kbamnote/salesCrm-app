import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setUnauthorizedHandler } from '../api';
import { stopBackgroundTracking } from '../services/locationTracking';
import { registerForPush, unregisterPush } from '../services/notifications';

const AuthContext = createContext(null);

// Last known user, cached so the app can open already signed-in when the very
// first request after a cold start / app update can't reach the server yet.
const USER_KEY = 'authUser';

// Normalize the user object — backends sometimes wrap it, sometimes don't
const extractUser = (data) => {
  if (!data) return null;
  // If response has a nested 'user' key, use that; otherwise use data directly
  return data.user || data;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Force logout without hitting the backend (the session is already dead —
  // e.g. the account was deactivated). Used by the 401 interceptor.
  const forceLogout = async () => {
    try { await stopBackgroundTracking(); } catch (e) {}
    try { await AsyncStorage.multiRemove(['token', USER_KEY]); } catch (e) {}
    setUser(null);
  };

  useEffect(() => {
    // Any 401 (expired token or a deactivated account) drops the user to Login.
    setUnauthorizedHandler(() => { forceLogout(); });
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;                       // never signed in on this device

      // Open with the cached user so a slow/unreachable first request doesn't
      // bounce the user to Login (this is what logged people out after an app
      // update: the very first call could fail while the network/DNS settled).
      let cached = null;
      try { cached = JSON.parse(await AsyncStorage.getItem(USER_KEY)); } catch (_) {}
      if (cached) setUser(cached);

      try {
        const r = await authApi.me();
        const fresh = extractUser(r.data);
        setUser(fresh);
        AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh)).catch(() => {});
        registerForPush().then(({ error }) => { if (error) console.log('[Push] restore session register:', error); });
      } catch (e) {
        // A real 401 is already handled by the response interceptor (it clears
        // the token and calls forceLogout). Everything else — offline, timeout,
        // 5xx, DNS not resolved yet — is transient, so KEEP the session rather
        // than deleting a perfectly valid token.
        if (e?.response?.status !== 401) {
          console.log('[Auth] keeping session, could not refresh user:', e.message);
          if (cached) {
            registerForPush().then(({ error }) => { if (error) console.log('[Push] offline restore:', error); });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const r = await authApi.login({ email, password });
    const u = extractUser(r.data);
    await AsyncStorage.setItem('token', r.data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
    setUser(u);
    registerForPush().then(({ error }) => { if (error) console.log('[Push] login register:', error); });
  };

  // Call this to force a fresh user fetch (e.g. from ProfileScreen)
  const refreshUser = async () => {
    try {
      const r = await authApi.me();
      const u = extractUser(r.data);
      setUser(u);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
    } catch (e) {
      console.log('Failed to refresh user', e);
    }
  };

  const logout = async () => {
    // Stop background location and detach this device's push token before
    // clearing the token, so a shared tablet stops receiving the prev user's
    // location service + notifications.
    await stopBackgroundTracking();
    await unregisterPush();
    await AsyncStorage.multiRemove(['token', USER_KEY]);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
