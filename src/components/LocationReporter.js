import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { attendanceApi } from '../api';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isTracking,
} from '../services/locationTracking';

/**
 * Headless reconciler (renders nothing). Background location posting is owned by
 * the TaskManager task in services/locationTracking.js — this component only
 * keeps the OS tracking state in sync with the user's punch status:
 *
 *  - App relaunched while still punched in (e.g. after the OS killed it) →
 *    resume tracking, but only if permission was already granted (never prompts
 *    on launch; punch-in is where we ask).
 *  - Punched out / not punched in → make sure tracking is stopped.
 */
export default function LocationReporter() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    const reconcile = async () => {
      try {
        const res = await attendanceApi.today();
        const record = res.data;
        const punchedIn = record?.punchIn && !record?.punchOut;
        if (cancelled) return;

        if (punchedIn) {
          if (!(await isTracking())) {
            // prompt:false → silently resume only if permission is still granted.
            await startBackgroundTracking({ prompt: false });
          }
        } else {
          await stopBackgroundTracking();
        }
      } catch (e) {
        console.log('LocationReporter reconcile failed:', e?.message || e);
      }
    };

    reconcile();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') reconcile();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [user]);

  return null;
}
