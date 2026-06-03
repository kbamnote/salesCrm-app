import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://sales-crm-backend-production.up.railway.app/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  me: () => api.get('/auth/me'),
};

export const clientsApi = {
  list: (params) => api.get('/clients', { params }),
  create: (data) => api.post('/clients', data),
  getById: (id) => api.get(`/clients/${id}`),
  update: (id, data) => api.put(`/clients/${id}`, data),
};

export const leadsApi = {
  list: (params) => api.get('/leads', { params }),
  create: (data) => api.post('/leads', data),
  getById: (id) => api.get(`/leads/${id}`),
  update: (id, data) => api.put(`/leads/${id}`, data),
};

export const targetsApi = {
  myTarget: (month) => api.get('/targets/my', { params: { month } }),
};

export const attendanceApi = {
  my: (month) => api.get('/attendance/my', { params: { month } }),
  today: () => api.get('/attendance/today'),
  punchIn: (data) => api.post('/attendance/punch-in', data),
  punchOut: (data) => api.post('/attendance/punch-out', data),
};

export const fieldVisitsApi = {
  list: (params) => api.get('/field-visits', { params }),
  create: (data) => api.post('/field-visits', data),
};

export const chatApi = {
  conversations: () => api.get('/chat/conversations'),
  messages: (chatId, params) => api.get(`/chat/messages/${chatId}`, { params }),
  send: (data) => api.post('/chat/send', data),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }),
};

export default api;
