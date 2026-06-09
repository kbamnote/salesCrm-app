import api from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_KEY = 'pendingPresentations';

// Helper to generate a unique ID for mock purposes
const generateId = () => Math.random().toString(36).substring(2, 9);

export const presentationService = {
  /**
   * Save a presentation record to the backend.
   * Uses a long timeout — uploads already happened, but the API server can be
   * slow to wake (cold start), and we don't want a false "network error".
   */
  async savePresentation(data) {
    try {
      const response = await api.post('/presentations', data, { timeout: 60000 });
      return response.data;
    } catch (error) {
      console.error('Error saving presentation:', error);
      throw error;
    }
  },

  // ───────── Offline-safe queue ─────────
  // A presentation is never lost: if upload/save fails, it's queued locally and
  // retried automatically (on next history-screen visit / app open).

  async getPending() {
    try {
      return JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || '[]');
    } catch (_) { return []; }
  },

  async _setPending(list) {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
  },

  async queuePresentation(item) {
    const list = await this.getPending();
    list.push({ id: generateId(), queuedAt: Date.now(), ...item });
    await this._setPending(list);
  },

  /**
   * Upload the local audio + selfie for one queued item, then save it.
   * `item` = { localAudioUri, selfieUri, duration, metadata }.
   */
  async _process(item) {
    const [audioUrl, selfieUrl] = await Promise.all([
      this.uploadAudio(item.localAudioUri),
      item.selfieUri ? this.uploadImage(item.selfieUri) : Promise.resolve(null),
    ]);
    return this.savePresentation({
      ...(item.metadata || {}),
      duration: item.duration,
      audioUrl,
      selfieUrl,
      localAudioUri: item.localAudioUri,
    });
  },

  /**
   * Try to upload+save now. On any failure, queue it locally and rethrow so the
   * caller can tell the user it's saved and will retry.
   */
  async submitPresentation(item) {
    try {
      return await this._process(item);
    } catch (err) {
      await this.queuePresentation(item);
      throw err;
    }
  },

  /** Retry all queued presentations. Returns counts. Safe to call anytime. */
  async flushPending() {
    const list = await this.getPending();
    if (!list.length) return { sent: 0, remaining: 0 };
    const remaining = [];
    for (const item of list) {
      try {
        await this._process(item);
      } catch (e) {
        remaining.push(item); // keep for next retry
      }
    }
    await this._setPending(remaining);
    return { sent: list.length - remaining.length, remaining: remaining.length };
  },

  /**
   * Get all presentations for the logged-in user
   */
  async getPresentations() {
    try {
      const response = await api.get('/presentations/my');
      return response.data;
    } catch (error) {
      console.error('Error fetching presentations:', error);
      return [];
    }
  },

  /**
   * Upload audio file to Cloudinary
   */
  async uploadAudio(fileUri) {
    try {
      const data = new FormData();
      data.append('file', {
        uri: fileUri,
        name: 'recording.m4a',
        type: 'audio/m4a'
      });
      data.append('upload_preset', 'salescrm_attendance');
      
      const res = await fetch('https://api.cloudinary.com/v1_1/dpreeciaf/video/upload', {
        method: 'POST',
        body: data,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await res.json();
      if (result.secure_url) {
        return result.secure_url;
      } else {
        throw new Error(result.error?.message || 'Failed to upload audio to Cloudinary');
      }
    } catch (error) {
      console.error('Cloudinary audio upload error:', error);
      throw error;
    }
  },

  /**
   * Upload image file to Cloudinary
   */
  async uploadImage(fileUri) {
    try {
      const data = new FormData();
      data.append('file', {
        uri: fileUri,
        name: 'selfie.jpg',
        type: 'image/jpeg'
      });
      data.append('upload_preset', 'salescrm_attendance');
      
      const res = await fetch('https://api.cloudinary.com/v1_1/dpreeciaf/image/upload', {
        method: 'POST',
        body: data,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await res.json();
      if (result.secure_url) {
        return result.secure_url;
      } else {
        throw new Error(result.error?.message || 'Failed to upload image to Cloudinary');
      }
    } catch (error) {
      console.error('Cloudinary image upload error:', error);
      throw error;
    }
  }
};
