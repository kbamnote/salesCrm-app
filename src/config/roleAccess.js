/**
 * Central role-access config — the single source of truth for what each role
 * sees in the app (bottom tabs, drawer items, landing screen, and which actions
 * are allowed). Mirrors the admin panel's nav.js idea.
 *
 * Screen keys must match the names registered in AppNavigator.
 */

// Bottom-tab icons (active / inactive).
export const TAB_DEFS = {
  Dashboard:   { active: 'home',   inactive: 'home-outline',   label: 'Dashboard' },
  Leads:       { active: 'funnel', inactive: 'funnel-outline', label: 'Leads' },
  Clients:     { active: 'people', inactive: 'people-outline', label: 'Clients' },
  Profile:     { active: 'person', inactive: 'person-outline', label: 'Profile' },
  TeamMonitor: { active: 'pulse',  inactive: 'pulse-outline',  label: 'Monitor Team' },
  TeamMap:     { active: 'map',    inactive: 'map-outline',    label: 'Team Map' },
  Onboarding:  { active: 'person-add', inactive: 'person-add-outline', label: 'Onboarding' },
  Designs:     { active: 'images', inactive: 'images-outline', label: 'Designs' },
  HRDashboard: { active: 'grid',   inactive: 'grid-outline',   label: 'HR Dashboard' },
  TelecallerDashboard: { active: 'headset', inactive: 'headset-outline', label: 'Dashboard' },
  WhatsApp: { active: 'logo-whatsapp', inactive: 'logo-whatsapp', label: 'WhatsApp' },
  Calls: { active: 'call', inactive: 'call-outline', label: 'Calls' },
};

// Drawer item title + icon.
export const DRAWER_DEFS = {
  TeamMonitor:         { title: 'Monitor Team',    icon: 'pulse-outline' },
  TeamProgress:        { title: 'Team Progress',   icon: 'trending-up-outline' },
  Targets:             { title: 'Set Targets',     icon: 'flag-outline' },
  OfferLetter:         { title: 'Appointment Letter', icon: 'document-text-outline' },
  Agreement:           { title: 'Agreement',       icon: 'reader-outline' },
  Attendance:          { title: 'My Attendance',   icon: 'calendar-outline' },
  FieldVisits:         { title: 'Field Visits',    icon: 'map-outline' },
  Designs:             { title: 'Designs',         icon: 'images-outline' },
  ChatList:            { title: 'Team Chat',       icon: 'chatbubbles-outline' },
  PresentationHistory: { title: 'Presentations',   icon: 'mic-outline' },
  Payroll:             { title: 'Payroll',         icon: 'cash-outline' },
  MyPayslips:          { title: 'My Payslips',     icon: 'receipt-outline' },
  // Tab-capable screens also exposed as drawer items (used by admin's full access).
  HRDashboard:         { title: 'HR Dashboard',    icon: 'grid-outline' },
  TeamMap:             { title: 'Team Map',        icon: 'map-outline' },
  Onboarding:          { title: 'Onboarding',      icon: 'person-add-outline' },
  Calls:               { title: 'Calls',           icon: 'call-outline' },
  TelecallerDashboard: { title: 'Telecaller Dashboard', icon: 'headset-outline' },
  WhatsApp:            { title: 'WhatsApp',         icon: 'logo-whatsapp' },
  SendWelcome:         { title: 'Welcome Letter',  icon: 'mail-outline' },
  SendMembership:      { title: 'Titanium Card',   icon: 'card-outline' },
};

// ───── Role presets ─────

// Field reps — the original/unchanged experience.
const fieldRep = {
  tabs: ['Dashboard', 'Leads', 'Clients', 'Profile'],
  drawer: ['Attendance', 'FieldVisits', 'Designs', 'ChatList', 'PresentationHistory', 'MyPayslips'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true },
};

// Oversight roles — field rep + team monitoring + live map tab.
const oversight = {
  tabs: ['Dashboard', 'Leads', 'TeamMap', 'Clients', 'Profile'],
  drawer: ['TeamMonitor', 'TeamProgress', 'Targets', 'Attendance', 'FieldVisits', 'Designs', 'ChatList', 'PresentationHistory', 'MyPayslips'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true, monitor: true },
};

export const ROLE_CONFIG = {
  // Field sales — field rep + can send Welcome Letter / Titanium Card to clients.
  sales: { ...fieldRep, drawer: [...fieldRep.drawer, 'SendWelcome', 'SendMembership'] },
  tms: fieldRep,
  tme: fieldRep,

  // Phone outreach — no field visits / presentations / close-deal.
  telecaller: {
    tabs: ['TelecallerDashboard', 'Leads', 'Calls', 'WhatsApp', 'Profile'],
    drawer: ['Attendance', 'Designs', 'ChatList', 'MyPayslips'],
    landing: 'TelecallerDashboard',
    can: { addLead: true },
  },

  // HR — oversight-first (monitor team), no sales pipeline tabs.
  hr: {
    tabs: ['HRDashboard', 'TeamMonitor', 'TeamMap', 'Onboarding', 'Profile'],
    drawer: ['Payroll', 'TeamProgress', 'Targets', 'OfferLetter', 'Agreement', 'SendWelcome', 'SendMembership', 'Attendance', 'ChatList', 'Designs', 'MyPayslips'],
    landing: 'HRDashboard',
    can: { monitor: true },
  },

  // Managers / leads — oversight.
  manager: oversight,
  bdo: oversight,
  team_leader: oversight,

  // Admin — full access to every screen & capability in the app.
  admin: {
    tabs: ['Dashboard', 'Leads', 'Clients', 'TeamMonitor', 'Profile'],
    drawer: [
      'HRDashboard', 'TeamMap', 'Onboarding', 'Calls', 'Designs',
      'TeamProgress', 'Targets', 'Payroll', 'OfferLetter', 'Agreement',
      'Attendance', 'FieldVisits', 'PresentationHistory', 'ChatList',
      'SendWelcome', 'SendMembership',
      'TelecallerDashboard', 'WhatsApp', 'MyPayslips',
    ],
    landing: 'Dashboard',
    can: {
      closeDeal: true, addLead: true, addClient: true, fieldVisit: true,
      presentations: true, monitor: true,
    },
  },

  // Designer — mainly uses the web panel; minimal app.
  designer: {
    tabs: ['Designs', 'Profile'],
    drawer: ['ChatList', 'MyPayslips'],
    landing: 'Designs',
    can: {},
  },
};

export const DEFAULT_CONFIG = fieldRep;

export const getRoleConfig = (role) => ROLE_CONFIG[role] || DEFAULT_CONFIG;

// Feature gate helper: can(role, 'closeDeal')
export const can = (role, feature) => !!getRoleConfig(role).can?.[feature];
