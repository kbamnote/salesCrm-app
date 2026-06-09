/**
 * Central role-access config — the single source of truth for what each role
 * sees in the app (bottom tabs, drawer items, landing screen, and which actions
 * are allowed). Mirrors the admin panel's nav.js idea.
 *
 * Screen keys must match the names registered in AppNavigator.
 */

// Bottom-tab icons (active / inactive).
export const TAB_DEFS = {
  Dashboard:   { active: 'home',   inactive: 'home-outline' },
  Leads:       { active: 'funnel', inactive: 'funnel-outline' },
  Clients:     { active: 'people', inactive: 'people-outline' },
  Profile:     { active: 'person', inactive: 'person-outline' },
  TeamMonitor: { active: 'pulse',  inactive: 'pulse-outline' },
  TeamMap:     { active: 'map',    inactive: 'map-outline' },
  Onboarding:  { active: 'person-add', inactive: 'person-add-outline' },
  Designs:     { active: 'images', inactive: 'images-outline' },
};

// Drawer item title + icon.
export const DRAWER_DEFS = {
  TeamMonitor:         { title: 'Monitor Team',  icon: 'pulse-outline' },
  Targets:             { title: 'Set Targets',   icon: 'flag-outline' },
  OfferLetter:         { title: 'Offer Letter',  icon: 'document-text-outline' },
  Agreement:           { title: 'Agreement',     icon: 'reader-outline' },
  Attendance:          { title: 'My Attendance', icon: 'calendar-outline' },
  FieldVisits:         { title: 'Field Visits',  icon: 'map-outline' },
  Designs:             { title: 'Designs',       icon: 'images-outline' },
  ChatList:            { title: 'Team Chat',     icon: 'chatbubbles-outline' },
  PresentationHistory: { title: 'Presentations', icon: 'mic-outline' },
};

// ───── Role presets ─────

// Field reps — the original/unchanged experience.
const fieldRep = {
  tabs: ['Dashboard', 'Leads', 'Clients', 'Profile'],
  drawer: ['Attendance', 'FieldVisits', 'Designs', 'ChatList', 'PresentationHistory'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true },
};

// Oversight roles — field rep + team monitoring + live map tab.
const oversight = {
  tabs: ['Dashboard', 'Leads', 'TeamMap', 'Clients', 'Profile'],
  drawer: ['TeamMonitor', 'Targets', 'Attendance', 'FieldVisits', 'Designs', 'ChatList', 'PresentationHistory'],
  landing: 'Dashboard',
  can: { closeDeal: true, addLead: true, addClient: true, fieldVisit: true, presentations: true, monitor: true },
};

export const ROLE_CONFIG = {
  // Field sales — untouched.
  sales: fieldRep,
  tms: fieldRep,
  tme: fieldRep,

  // Phone outreach — no field visits / presentations / close-deal.
  telecaller: {
    tabs: ['Dashboard', 'Leads', 'Clients', 'Profile'],
    drawer: ['Attendance', 'Designs', 'ChatList'],
    landing: 'Leads',
    can: { addLead: true, addClient: true },
  },

  // HR — oversight-first (monitor team), no sales pipeline tabs.
  hr: {
    tabs: ['TeamMonitor', 'TeamMap', 'Onboarding', 'Profile'],
    drawer: ['Targets', 'OfferLetter', 'Agreement', 'Attendance', 'ChatList', 'Designs'],
    landing: 'TeamMonitor',
    can: { monitor: true },
  },

  // Managers / leads / admin — oversight.
  manager: oversight,
  bdo: oversight,
  team_leader: oversight,
  admin: oversight,

  // Designer — mainly uses the web panel; minimal app.
  designer: {
    tabs: ['Designs', 'Profile'],
    drawer: ['ChatList'],
    landing: 'Designs',
    can: {},
  },
};

export const DEFAULT_CONFIG = fieldRep;

export const getRoleConfig = (role) => ROLE_CONFIG[role] || DEFAULT_CONFIG;

// Feature gate helper: can(role, 'closeDeal')
export const can = (role, feature) => !!getRoleConfig(role).can?.[feature];
