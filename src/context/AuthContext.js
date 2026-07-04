import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setUnauthorizedHandler } from '../api';
import { stopBackgroundTracking } from '../services/locationTracking';
import { registerForPush, unregisterPush } from '../services/notifications';

const AuthContext = createContext(null);

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
    try { await AsyncStorage.removeItem('token'); } catch (e) {}
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
      if (token) {
        const r = await authApi.me();
        setUser(extractUser(r.data));
        registerForPush().then(({ error }) => { if (error) console.log('[Push] restore session register:', error); });
      }
    } catch (e) {
      console.log('Failed to restore token', e);
      await AsyncStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const r = await authApi.login({ email, password });
    await AsyncStorage.setItem('token', r.data.token);
    setUser(extractUser(r.data));
    registerForPush().then(({ error }) => { if (error) console.log('[Push] login register:', error); });
  };

  // Call this to force a fresh user fetch (e.g. from ProfileScreen)
  const refreshUser = async () => {
    try {
      const r = await authApi.me();
      setUser(extractUser(r.data));
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
    await AsyncStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
