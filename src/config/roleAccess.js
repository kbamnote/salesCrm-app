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
  ChatList: { active: 'chatbubbles', inactive: 'chatbubbles-outline', label: 'Team Chat' },
};

// Drawer item title + icon.
export const DRAWER_DEFS = {
  TeamMonitor:         { title: 'Monitor Team',    icon: 'pulse-outline' },
  TeamProgress:        { title: 'Team Progress',   icon: 'trending-up-outline' },
  Targets:             { title: 'Set Targets',     icon: 'flag-outline' },
  OfferLetter:         { title: 'Appointment Letter', icon: 'document-text-outline' },
  Agreement:           { title: 'Agreement',       icon: 'reader-outline' },
  Attendance:          { title: 'My Attendance',   icon: 'calendar-outline' },
  Leave:               { title: 'Leave',           icon: 'airplane-outline' },
  DailyReports:        { title: 'Daily Reports',   icon: 'document-text-outline' },
  FieldVisits:         { title: 'Field Visits',    icon: 'map-outline' },
  Designs:             { title: 'Designs',         icon: 'images-outline' },
  ChatList:            { title: 'Team Chat',       icon: 'chatbubbles-outline' },
  PresentationHistory: { title: 'Presentations',   icon: 'mic-outline' },
  Payroll:             { title: 'Payroll',         icon: 'cash-outline' },
  MyPayslips:          { title: 'My Payslips',     icon: 'receipt-outline' },
  // Tab-capable screens also exposed as drawer items (used by admin's full access).
  HRDashboard:         { title: 'HR Dashboard',    icon: 'grid-outline' },
  TeamMap:             { title: 'Team Map',        icon: 'map-outline' },
  RouteHistory:        { title: 'Route History',   icon: 'navigate-outline' },
  Onboarding:          { title: 'Onboarding',      icon: 'person-add-outline' },
  Calls:               { title: 'Calls',           icon: 'call-outline' },
  TelecallerDashboard: { title: 'Telecaller Dashboard', icon: 'headset-outline' },
  WhatsApp:            { title: 'WhatsApp',         icon: 'logo-whatsapp' },
  SendWelcome:         { title: 'Welcome Letter',  icon: 'mail-outline' },
  SendMembership:      { title: 'Titanium Card',   icon: 'card-outline' },
  CloseDeal:           { title: 'Close a Deal',    icon: 'checkmark-done-circle-outline' },
  SendNotification:    { title: 'Notifications',   icon: 'notifications-outline' },
  TeamManagement:      { title: 'Team Management',  icon: 'people-circle-outline' },
  NewClients:          { title: 'New Clients',      icon: 'sparkles-outline' },
  CampaignLeads:       { title: 'Campaign Leads',   icon: 'megaphone-outline' },
  DialPad:             { title: 'Dial Pad',         icon: 'keypad-outline' },
  CallFunnel:          { title: 'Appointments',     icon: 'funnel-outline' },
  DailyFieldVisit:     { title: 'Daily Field Visit', icon: 'clipboard-outline' },
  Support:             { title: 'Support',          icon: 'help-buoy-outline' },
  SalesPresentation:   { title: 'Sales Presentation', icon: 'easel-outline' },
  Fulfillment:         { title: 'Orders',           icon: 'cube-outline' },
  TeamAttendance:      { title: 'Team Attendance',  icon: 'clipboard-outline' },
  LateStaff:           { title: 'Late Staff',       icon: 'alarm-outline' },
};

// ───── Role presets ─────

// Field reps — the original/unchanged experience.
const fieldRep = {
  tabs: ['Dashboard', 'Leads', 'Clients', 'ChatList', 'Profile'],
  drawer: ['DailyFieldVisit', 'CallFunnel', 'Attendance', 'Leave', 'FieldVisits', 'Designs', 'PresentationHistory', 'Fulfillment', 'MyPayslips'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true },
};

// Oversight roles — field rep + team monitoring + live map tab.
const oversight = {
  tabs: ['Dashboard', 'Leads', 'TeamMap', 'Clients', 'ChatList', 'Profile'],
  drawer: ['DailyFieldVisit', 'CallFunnel', 'TeamMonitor', 'RouteHistory', 'TeamProgress', 'Targets', 'Attendance', 'LateStaff', 'Leave', 'FieldVisits', 'Designs', 'PresentationHistory', 'Fulfillment', 'MyPayslips'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true, monitor: true },
};

// TMS/TME are field reps who ALSO make calls, so they get the dial pad on top
// of the standard field-rep access.
const callingFieldRep = {
  ...fieldRep,
  drawer: ['DialPad', ...fieldRep.drawer],
};

export const ROLE_CONFIG = {
  sales: fieldRep,
  tms: callingFieldRep,
  tme: callingFieldRep,

  // Phone outreach — no field visits / presentations / close-deal.
  telecaller: {
    tabs: ['TelecallerDashboard', 'Leads', 'Calls', 'WhatsApp', 'ChatList', 'Profile'],
    drawer: ['DialPad', 'CallFunnel', 'Attendance', 'Leave', 'Designs', 'MyPayslips'],
    landing: 'TelecallerDashboard',
    can: { addLead: true },
  },

  // Assistant HR — same as a telecaller (does calling) but ALSO owns the
  // fulfillment Data Collection & Kit Check stages, so she gets the Orders
  // section that regular telecallers don't see.
  assistant_hr: {
    tabs: ['TelecallerDashboard', 'Leads', 'Calls', 'WhatsApp', 'ChatList', 'Profile'],
    drawer: ['DialPad', 'CallFunnel', 'CloseDeal', 'Attendance', 'Leave', 'Designs', 'Fulfillment', 'MyPayslips'],
    landing: 'TelecallerDashboard',
    can: { addLead: true, closeDeal: true },
  },

  // HR — oversight-first (monitor team), no sales pipeline tabs.
  hr: {
    tabs: ['HRDashboard', 'TeamMonitor', 'TeamMap', 'Onboarding', 'ChatList', 'Profile'],
    drawer: ['CallFunnel', 'NewClients', 'CampaignLeads', 'Support', 'SalesPresentation', 'CloseDeal', 'SendNotification', 'DailyReports', 'RouteHistory', 'Fulfillment', 'Payroll', 'TeamProgress', 'Targets', 'OfferLetter', 'Agreement', 'Attendance', 'TeamAttendance', 'LateStaff', 'Leave', 'Designs', 'MyPayslips'],
    landing: 'HRDashboard',
    can: { monitor: true, closeDeal: true, addClient: true },
  },

  // Managers / leads — oversight.
  manager: oversight,
  bdo: oversight,
  team_leader: oversight,

  // Admin — full access to every screen & capability in the app.
  admin: {
    tabs: ['Dashboard', 'Leads', 'Clients', 'TeamMonitor', 'ChatList', 'Profile'],
    drawer: [
      'TeamManagement', 'DialPad', 'CallFunnel', 'DailyFieldVisit', 'NewClients', 'CampaignLeads', 'Support', 'SalesPresentation',
      'SendNotification', 'HRDashboard', 'TeamMap', 'DailyReports', 'RouteHistory', 'Fulfillment', 'Onboarding', 'Calls', 'Designs',
      'TeamProgress', 'Targets', 'Payroll', 'OfferLetter', 'Agreement', 'Leave',
      'Attendance',
      'PresentationHistory', 'TeamAttendance', 'LateStaff',
      'TelecallerDashboard', 'WhatsApp', 'MyPayslips',
    ],
    landing: 'Dashboard',
    can: {
      closeDeal: true, addLead: true, addClient: true, fieldVisit: true,
      presentations: true, monitor: true,
    },
  },

  // Designer — mainly uses the web panel; minimal app. Owns the website stage.
  designer: {
    tabs: ['Designs', 'ChatList', 'Profile'],
    drawer: ['Fulfillment', 'Attendance', 'Leave', 'MyPayslips'],
    landing: 'Designs',
    can: {},
  },

  // Social media manager — sets up client socials (the conditional pipeline stage).
  social_media: {
    tabs: ['Designs', 'ChatList', 'Profile'],
    drawer: ['Fulfillment', 'Attendance', 'Leave', 'MyPayslips'],
    landing: 'Designs',
    can: {},
  },
};

export const DEFAULT_CONFIG = fieldRep;

export const getRoleConfig = (role) => ROLE_CONFIG[role] || DEFAULT_CONFIG;

// Feature gate helper: can(role, 'closeDeal')
export const can = (role, feature) => !!getRoleConfig(role).can?.[feature];
