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
  // Assign to a salesperson/TMS (+ optional status); notifies the assignee.
  assign: (id, data) => api.post(`/leads/${id}/assign`, data),
};

export const targetsApi = {
  myTarget: (month) => api.get('/targets/my', { params: { month } }),
  list: (params) => api.get('/targets', { params }),
  team: (month) => api.get('/targets/team', { params: { month } }),
  // Department target totals (sales team / telecallers / HR) — admin dashboard.
  summary: (month) => api.get('/targets/summary', { params: { month } }),
  set: (data) => api.post('/targets', data), // { userId, month, target } — HR/manager/admin
};

export const attendanceApi = {
  my: (month) => api.get('/attendance/my', { params: { month } }),
  today: () => api.get('/attendance/today'),
  punchIn: (data) => api.post('/attendance/punch-in', data),
  punchOut: (data) => api.post('/attendance/punch-out', data),
  // Oversight: all team attendance for a given date (admin/manager/hr only).
  byDate: (date) => api.get('/attendance', { params: { date } }),
  // Full roster with present/absent status for a day (absentees included).
  roster: (date) => api.get('/attendance/roster', { params: date ? { date } : {} }),
};

export const fieldVisitsApi = {
  list: (params) => api.get('/field-visits', { params }),
  create: (data) => api.post('/field-visits', data),
};

export const dealsApi = {
  // Log a closed deal from the app (broadcasts to all users server-side).
  close: (data) => api.post('/deals/close', data),
  stats: (month) => api.get('/deals/stats', { params: { month } }),
  monthly: (months = 6) => api.get('/deals/monthly', { params: { months } }),
};

export const designsApi = {
  list: () => api.get('/designs'),
};

export const offerLetterApi = {
  designations: () => api.get('/offer-letter/designations'),
  generate: (data) => api.post('/offer-letter', data), // returns { filename, base64 }
};

export const agreementApi = {
  designations: () => api.get('/agreement/designations'),
  generate: (data) => api.post('/agreement', data), // returns { filename, base64 }
};

export const locationsApi = {
  // Report this user's current position; backend upserts one row per user.
  update: (data) => api.post('/locations/update', data),
  // Oversight: latest location of every visible team member.
  list: () => api.get('/locations'),
};

export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  registerToken: (token) => api.post('/notifications/push-token', { token }),
  removeToken: (token) => api.post('/notifications/push-token/remove', { token }),
  testPush: () => api.post('/notifications/test-push'),
};

export const chatApi = {
  conversations: () => api.get('/chat/conversations'),
  messages: (chatId, params) => api.get(`/chat/messages/${chatId}`, { params }),
  send: (data) => api.post('/chat/send', data),
  groups: () => api.get('/chat/groups'),
  groupDetail: (id) => api.get(`/chat/groups/${id}`),
  createGroup: (data) => api.post('/chat/groups', data),
  // Mark all messages in a chat (from others) as read by the current user.
  markRead: (chatId) => api.post(`/chat/${chatId}/read`),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }),
  // All active users company-wide (for team chat) — not hierarchy-filtered.
  contacts: () => api.get('/users/contacts'),
  // Onboard a new employee (admin/manager/bdo/team_leader/hr).
  create: (data) => api.post('/users', data),
};

export const hrDashboardApi = {
  stats: (month) => api.get('/hr-dashboard/stats', { params: { month } }),
};

export const callsApi = {
  list: () => api.get('/calls'),
  create: (data) => api.post('/calls', data),
  update: (id, data) => api.put(`/calls/${id}`, data),
  // Upsert one call-log entry per lead (who was called + status + assignee).
  logLead: (data) => api.post('/calls/log-lead', data),
};

export const telecallerDashApi = {
  stats: () => api.get('/telecaller-dashboard/stats'),
};

export const payrollApi = {
  // HR: list employees + whether their salary structure is set.
  employees: () => api.get('/payroll/employees'),
  // Salary structure (fill once). GET works for HR or the owning employee.
  getStructure: (userId) => api.get(`/payroll/structure/${userId}`),
  saveStructure: (userId, data) => api.put(`/payroll/structure/${userId}`, data),
  // Payslips. list() → HR all (optional userId); employee → own.
  listPayslips: (userId) => api.get('/payroll/payslips', { params: userId ? { userId } : {} }),
  getPayslip: (id) => api.get(`/payroll/payslips/${id}`),
  createPayslip: (data) => api.post('/payroll/payslips', data),
  payslipPdf: (id) => api.get(`/payroll/payslips/${id}/pdf`), // { filename, base64 }
  deletePayslip: (id) => api.delete(`/payroll/payslips/${id}`),
};

export const profileApi = {
  me: () => api.get('/profile/me'),
  update: (data) => api.put('/profile/me', data), // { user: {...}, profile: {...} }
  uploadPhoto: (photo) => api.post('/profile/me/photo', { photo }), // photo = url or base64
};

export default api;
