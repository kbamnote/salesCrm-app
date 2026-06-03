import api from '../api';

// Helper to generate a unique ID for mock purposes
const generateId = () => Math.random().toString(36).substring(2, 9);

export const presentationService = {
  /**
   * Save a presentation record to the backend
   */
  async savePresentation(data) {
    try {
      const response = await api.post('/presentations', data);
      return response.data;
    } catch (error) {
      console.error('Error saving presentation:', error);
      throw error;
    }
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
