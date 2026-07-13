import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://sales-crm-backend-production-0187.up.railway.app/api';
// Socket.IO connects to the server origin (without the /api suffix).
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

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

// When any request comes back 401 — an expired token OR an account that was
// deactivated (the auth middleware rejects inactive users on EVERY request) —
// drop the stored token and tell the app to return to the login screen, so a
// user who's already logged in is kicked out the moment they're deactivated.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error?.response?.status === 401) {
      try { await AsyncStorage.removeItem('token'); } catch (e) {}
      if (onUnauthorized) { try { onUnauthorized(); } catch (e) {} }
    }
    return Promise.reject(error);
  }
);

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
  // Admin/HR: every submitted daily report for a date (default today).
  reports: (date) => api.get('/attendance/reports', { params: date ? { date } : {} }),
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
  // Record a payment against a closed deal (mode: cash|pdc|upi|card).
  addPayment: (id, data) => api.post(`/deals/${id}/payment`, data),
};

export const tapifyCardApi = {
  // Create the customer's Tapify card (user + vCard) via the CRM bridge.
  create: (data) => api.post('/tapify-card/create', data),
};

export const designsApi = {
  list: () => api.get('/designs'),
  // Upload a design (designer/admin/manager). { title, imageUrl } — imageUrl is a
  // hosted URL (we upload the image to Cloudinary first, same as the web panel).
  create: (data) => api.post('/designs', data),
  // Delete a design — allowed for the uploader or an admin.
  remove: (id) => api.delete(`/designs/${id}`),
};

export const offerLetterApi = {
  designations: () => api.get('/offer-letter/designations'),
  generate: (data) => api.post('/offer-letter', data), // returns { filename, base64 }
};

// Sales presentation decks — admin/HR upload a PDF and assign it to sales staff.
export const salesDecksApi = {
  list: () => api.get('/sales-decks'),
  create: (data) => api.post('/sales-decks', data),
  update: (id, data) => api.put(`/sales-decks/${id}`, data),
  remove: (id) => api.delete(`/sales-decks/${id}`),
};

// New Clients — digital-card onboarding requests captured over WhatsApp (admin/HR).
export const newClientsApi = {
  list: (params) => api.get('/new-clients', { params }),
  update: (id, data) => api.patch(`/new-clients/${id}`, data),
  remove: (id) => api.delete(`/new-clients/${id}`),
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
  // A user's route history for a day. params: { from, to } (ISO strings).
  history: (userId, params) => api.get(`/locations/history/${userId}`, { params }),
};

export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  registerToken: (token) => api.post('/notifications/push-token', { token }),
  removeToken: (token) => api.post('/notifications/push-token/remove', { token }),
  testPush: () => api.post('/notifications/test-push'),
  // Admin/HR: send broadcast (to:'all') or individual (to: userId).
  // Pass scheduledAt (ISO string) to queue it for later instead of sending now.
  send: (data) => api.post('/notifications', data),
  // Admin/HR: pending scheduled notifications + cancel.
  scheduled: () => api.get('/notifications/scheduled'),
  cancelScheduled: (id) => api.delete(`/notifications/scheduled/${id}`),
  // Admin/HR: history of notifications this user has sent (newest first).
  sent: () => api.get('/notifications/sent'),
};

export const chatApi = {
  conversations: () => api.get('/chat/conversations'),
  messages: (chatId, params) => api.get(`/chat/messages/${chatId}`, { params }),
  send: (data) => api.post('/chat/send', data),
  groups: () => api.get('/chat/groups'),
  groupDetail: (id) => api.get(`/chat/groups/${id}`),
  createGroup: (data) => api.post('/chat/groups', data),
  // Group admin actions. updateGroup body: { name?, add?: [ids], remove?: [ids] }.
  updateGroup: (id, data) => api.patch(`/chat/groups/${id}`, data),
  leaveGroup: (id) => api.post(`/chat/groups/${id}/leave`),
  deleteGroup: (id) => api.delete(`/chat/groups/${id}`),
  // Mark all messages in a chat (from others) as read by the current user.
  markRead: (chatId) => api.post(`/chat/${chatId}/read`),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }),
  // All active users company-wide (for team chat) — not hierarchy-filtered.
  contacts: () => api.get('/users/contacts'),
  // Onboard a new employee (admin/manager/bdo/team_leader/hr).
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  // Admin team management:
  setActive: (id, active) => api.post(`/users/${id}/set-active`, { active }),
  remove: (id) => api.delete(`/users/${id}`),
  changePassword: (id, newPassword) => api.post(`/users/${id}/admin-change-password`, { newPassword }),
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
  // Admin/HR: total salary spend grouped by month. Optional { year } or { month }.
  salarySpend: (params) => api.get('/payroll/salary-spend', { params }),
  getPayslip: (id) => api.get(`/payroll/payslips/${id}`),
  createPayslip: (data) => api.post('/payroll/payslips', data),
  payslipPdf: (id) => api.get(`/payroll/payslips/${id}/pdf`), // { filename, base64 }
  deletePayslip: (id) => api.delete(`/payroll/payslips/${id}`),
};

export const clientDocsApi = {
  // Generate + email a PDF to the client via Resend (no Word attachment).
  sendWelcome: (data) => api.post('/tapify-welcome/send', data),
  sendMembership: (data) => api.post('/membership/send', data),
};

export const whatsappApi = {
  send: (data) => api.post('/whatsapp/send', data).then(r => r.data),
  sendBulk: (data) => api.post('/whatsapp/bulk', data).then(r => r.data),
  templates: () => api.get('/whatsapp/templates').then(r => r.data),
  conversations: () => api.get('/whatsapp/conversations').then(r => r.data),
  thread: (phone) => api.get('/whatsapp/thread/' + encodeURIComponent(phone)).then(r => r.data),
};

export const profileApi = {
  me: () => api.get('/profile/me'),
  update: (data) => api.put('/profile/me', data), // { user: {...}, profile: {...} }
  uploadPhoto: (photo) => api.post('/profile/me/photo', { photo }), // photo = url or base64
};

export const appConfigApi = {
  // Public: latest app version + Play Store link, for the update prompt.
  get: () => api.get('/public/app-config'),
};

export const leavesApi = {
  // Apply for leave. data: { leaveType, fromDate, toDate, reason }
  apply: (data) => api.post('/leaves', data),
  // Own leave history (any role).
  my: () => api.get('/leaves/my'),
  // Withdraw a still-pending request of your own.
  cancel: (id) => api.post(`/leaves/${id}/cancel`),
  // Admin/HR: every request in the company. params: { status? }
  list: (params) => api.get('/leaves', { params }),
  approve: (id) => api.post(`/leaves/${id}/approve`),
  reject: (id, note) => api.post(`/leaves/${id}/reject`, { note }),
};

export default api;
