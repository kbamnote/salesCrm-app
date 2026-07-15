import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { Theme } from '../theme/Theme';
import LocationReporter from '../components/LocationReporter';
import UpdateChecker from '../components/UpdateChecker';
import { getRoleConfig, TAB_DEFS, DRAWER_DEFS } from '../config/roleAccess';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Main Screens (shown in bottom tab bar)
import DashboardScreen from '../screens/main/DashboardScreen';
import LeadsScreen from '../screens/main/LeadsScreen';
import ClientsScreen from '../screens/main/ClientsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Drawer / Sidebar screens
import AttendanceScreen from '../screens/main/AttendanceScreen';
import FieldVisitsScreen from '../screens/main/FieldVisitsScreen';
import ChatListScreen from '../screens/main/ChatListScreen';
import ChatRoomScreen from '../screens/main/ChatRoomScreen';
import NewChatScreen from '../screens/main/NewChatScreen';
// NOTE: Mobile "Live Map" (react-native-maps) removed — it required a Google Maps
// API key. Employee tracking + the admin Live Map work without it.
import CloseDealScreen from '../screens/main/CloseDealScreen';
import DesignsScreen from '../screens/main/DesignsScreen';
import HRDashboardScreen from '../screens/main/HRDashboardScreen';
import TelecallerDashboardScreen from '../screens/main/TelecallerDashboardScreen';
import WhatsAppScreen from '../screens/main/WhatsAppScreen';
import WhatsAppChatScreen from '../screens/main/WhatsAppChatScreen';
import CallsScreen from '../screens/main/CallsScreen';
import TeamMonitorScreen from '../screens/main/TeamMonitorScreen';
import TeamMapScreen from '../screens/main/TeamMapScreen';
import SetTargetScreen from '../screens/main/SetTargetScreen';
import TeamProgressScreen from '../screens/main/TeamProgressScreen';
import OnboardingScreen from '../screens/main/OnboardingScreen';
import OfferLetterScreen from '../screens/main/OfferLetterScreen';
import AgreementScreen from '../screens/main/AgreementScreen';
import PresentationHistoryScreen from '../screens/main/PresentationHistoryScreen';
import PayrollScreen from '../screens/main/PayrollScreen';
import MyPayslipsScreen from '../screens/main/MyPayslipsScreen';
import PayrollEmployeeScreen from '../screens/main/PayrollEmployeeScreen';
import PayslipDetailScreen from '../screens/main/PayslipDetailScreen';
import SendWelcomeLetterScreen from '../screens/main/SendWelcomeLetterScreen';
import SendTitaniumCardScreen from '../screens/main/SendTitaniumCardScreen';
import DealCompletedScreen from '../screens/main/DealCompletedScreen';
import SendNotificationScreen from '../screens/main/SendNotificationScreen';
import RouteHistoryScreen from '../screens/main/RouteHistoryScreen';
import LeaveScreen from '../screens/main/LeaveScreen';
import DailyReportsScreen from '../screens/main/DailyReportsScreen';
import NewClientsScreen from '../screens/main/NewClientsScreen';
import CampaignLeadsScreen from '../screens/main/CampaignLeadsScreen';
import SupportRequestsScreen from '../screens/main/SupportRequestsScreen';
import SalesPresentationScreen from '../screens/main/SalesPresentationScreen';

// Stack-only screens (detail pages)
import AddLeadScreen from '../screens/main/AddLeadScreen';
import LeadDetailScreen from '../screens/main/LeadDetailScreen';
import PresentationFormScreen from '../screens/main/PresentationFormScreen';
import PresentationRecordingScreen from '../screens/main/PresentationRecordingScreen';
import AddClientScreen from '../screens/main/AddClientScreen';
import ClientDetailScreen from '../screens/main/ClientDetailScreen';
import TeamMembersScreen from '../screens/main/TeamMembersScreen';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const headerStyle = {
  headerStyle: { backgroundColor: Theme.colors.primary, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
  headerTintColor: Theme.colors.white,
  headerTitleStyle: {
    fontFamily: Theme.typography.fontFamily,
    fontWeight: Theme.typography.weights.bold,
  },
};

// Components available as bottom tabs / drawer items (keyed by screen name).
const TAB_COMPONENTS = {
  Dashboard: DashboardScreen,
  HRDashboard: HRDashboardScreen,
  TelecallerDashboard: TelecallerDashboardScreen,
  WhatsApp: WhatsAppScreen,
  Calls: CallsScreen,
  Leads: LeadsScreen,
  Clients: ClientsScreen,
  Profile: ProfileScreen,
  TeamMonitor: TeamMonitorScreen,
  TeamMap: TeamMapScreen,
  Onboarding: OnboardingScreen,
  Designs: DesignsScreen,
};
const DRAWER_COMPONENTS = {
  TeamMonitor: TeamMonitorScreen,
  TeamProgress: TeamProgressScreen,
  Targets: SetTargetScreen,
  OfferLetter: OfferLetterScreen,
  Agreement: AgreementScreen,
  Attendance: AttendanceScreen,
  FieldVisits: FieldVisitsScreen,
  Designs: DesignsScreen,
  ChatList: ChatListScreen,
  PresentationHistory: PresentationHistoryScreen,
  Payroll: PayrollScreen,
  MyPayslips: MyPayslipsScreen,
  // Tab-capable screens also usable as drawer items (admin full access).
  HRDashboard: HRDashboardScreen,
  TeamMap: TeamMapScreen,
  Onboarding: OnboardingScreen,
  Calls: CallsScreen,
  TelecallerDashboard: TelecallerDashboardScreen,
  WhatsApp: WhatsAppScreen,
  SendWelcome: SendWelcomeLetterScreen,
  SendMembership: SendTitaniumCardScreen,
  CloseDeal: CloseDealScreen,
  SendNotification: SendNotificationScreen,
  RouteHistory: RouteHistoryScreen,
  Leave: LeaveScreen,
  DailyReports: DailyReportsScreen,
  NewClients: NewClientsScreen,
  CampaignLeads: CampaignLeadsScreen,
  Support: SupportRequestsScreen,
  SalesPresentation: SalesPresentationScreen,
  TeamManagement: TeamMembersScreen,
};

// Drawer items whose screen renders its OWN header — suppress the drawer header
// for these to avoid a double header.
const DRAWER_SCREENS_OWN_HEADER = ['Onboarding'];

// Screens where we do NOT want to show the tab bar (detail/form screens)
const HIDDEN_TAB_SCREENS = [
  'Login', 'AddLead', 'LeadDetail', 'ClientDetail',
  'PresentationForm', 'PresentationRecording', 'ChatRoom', 'NewChat', 'CloseDeal',
  'PayrollEmployee', 'PayslipDetail', 'DealCompleted', 'SendWelcome', 'SendMembership',
  'WhatsAppChat',
];

/** Global floating tab bar — rendered outside navigation so it appears everywhere */
function GlobalTabBar({ navigationRef, currentRoute, tabs }) {
  const insets = useSafeAreaInsets();

  if (HIDDEN_TAB_SCREENS.includes(currentRoute)) return null;

  const navigateTo = (screenName) => {
    // Navigate to the Drawer's Home group first, then to the specific tab screen
    navigationRef.current?.navigate('Root', {
      screen: 'Home',
      params: { screen: screenName },
    });
  };

  return (
    <View style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60 + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: Theme.colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      elevation: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      paddingHorizontal: 8,
      zIndex: 999,
    }}>
      {tabs.map((tab) => {
        const isFocused = currentRoute === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            onPress={() => navigateTo(tab.name)}
            activeOpacity={0.8}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 58 }}
          >
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: isFocused ? '#ffffff' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons
                name={isFocused ? tab.active : tab.inactive}
                size={24}
                color={isFocused ? Theme.colors.primary : '#ffffff'}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Inner tabs (no visible tab bar — handled by GlobalTabBar). Role-driven. */
const InnerStack = createNativeStackNavigator();

const SCREENS_WITH_OWN_HEADER = ['Dashboard', 'Leads', 'Clients', 'Profile', 'Onboarding'];

function HomeStack({ navigation: drawerNav }) {
  const { user } = useAuth();
  const cfg = getRoleConfig(user?.role);

  const tabHeaderOptions = (name) => {
    if (SCREENS_WITH_OWN_HEADER.includes(name)) {
      return { headerShown: false };
    }
    const def = TAB_DEFS[name];
    return {
      headerShown: true,
      title: def?.label || name,
      ...headerStyle,
      headerLeft: () => (
        <TouchableOpacity onPress={() => drawerNav.openDrawer()} style={{ marginRight: 12 }}>
          <Ionicons name="menu" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
      ),
    };
  };

  return (
    <InnerStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={cfg.landing}>
      {cfg.tabs.map((name) => {
        const Comp = TAB_COMPONENTS[name];
        return Comp ? <InnerStack.Screen key={name} name={name} component={Comp} options={tabHeaderOptions(name)} /> : null;
      })}
    </InnerStack.Navigator>
  );
}

// ADMIN-ONLY sidebar grouping. Each section is a collapsible dropdown that
// holds the admin's EXISTING drawer items (nothing added/removed — only grouped).
// Any admin drawer item not listed here falls through to the "General" section,
// so future additions can't silently disappear.
const ADMIN_DRAWER_SECTIONS = [
  { key: 'sales',      title: 'Sales',      icon: 'briefcase-outline', items: ['TeamMap', 'RouteHistory', 'TeamProgress', 'Targets', 'PresentationHistory', 'Designs'] },
  { key: 'telecaller', title: 'Telecaller', icon: 'headset-outline',   items: ['TelecallerDashboard', 'Calls', 'WhatsApp'] },
  { key: 'hr',         title: 'HR',         icon: 'people-outline',     items: ['HRDashboard', 'Onboarding', 'TeamManagement', 'Payroll', 'OfferLetter', 'Agreement', 'SendNotification'] },
  { key: 'general',    title: 'General',    icon: 'apps-outline',       items: ['ChatList', 'MyPayslips'] },
];

// Sectioned (dropdown) drawer — admin only.
function SectionedAdminDrawer(props) {
  const { state, navigation } = props;
  const routeNames = state.routes.map((r) => r.name);      // actually-registered drawer routes
  const focused = state.routes[state.index]?.name;         // index maps into routes, not routeNames
  const present = new Set(routeNames);

  // Build the visible sections from what's actually registered, then sweep any
  // unassigned admin item into General so nothing is dropped.
  const assigned = new Set(ADMIN_DRAWER_SECTIONS.flatMap((s) => s.items));
  const sections = ADMIN_DRAWER_SECTIONS.map((s) => ({ ...s, items: s.items.filter((n) => present.has(n)) }));
  const leftovers = routeNames.filter((n) => n !== 'Home' && !assigned.has(n));
  if (leftovers.length) {
    const gen = sections.find((s) => s.key === 'general');
    if (gen) gen.items = [...gen.items, ...leftovers];
  }

  // Start with the section holding the current screen expanded; rest collapsed.
  const [open, setOpen] = useState(() => {
    const init = {};
    sections.forEach((s) => { init[s.key] = s.items.includes(focused); });
    return init;
  });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const go = (name) => navigation.navigate(name);

  const homeActive = focused === 'Home';

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingBottom: 110 }}>
      {/* Home */}
      <TouchableOpacity style={[drawerStyles.row, homeActive && drawerStyles.rowActive]} onPress={() => go('Home')} activeOpacity={0.7}>
        <Ionicons name="home-outline" size={22} color={homeActive ? Theme.colors.primary : Theme.colors.textSecondary} />
        <Text style={[drawerStyles.label, homeActive && drawerStyles.labelActive]}>Home</Text>
      </TouchableOpacity>

      {sections.map((sec) => {
        if (sec.items.length === 0) return null;
        const isOpen = !!open[sec.key];
        const sectionActive = sec.items.includes(focused);
        return (
          <View key={sec.key} style={drawerStyles.section}>
            <TouchableOpacity style={drawerStyles.sectionHeader} onPress={() => toggle(sec.key)} activeOpacity={0.7}>
              <Ionicons name={sec.icon} size={18} color={sectionActive ? Theme.colors.primary : Theme.colors.text} />
              <Text style={[drawerStyles.sectionTitle, sectionActive && { color: Theme.colors.primary }]}>{sec.title}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.colors.textSecondary} />
            </TouchableOpacity>

            {isOpen && sec.items.map((name) => {
              const def = DRAWER_DEFS[name] || {};
              const active = focused === name;
              const title = name === 'MyPayslips' ? 'Salary Spend' : (def.title || name);
              return (
                <TouchableOpacity
                  key={name}
                  style={[drawerStyles.row, drawerStyles.rowNested, active && drawerStyles.rowActive]}
                  onPress={() => go(name)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={def.icon || 'ellipse-outline'} size={20} color={active ? Theme.colors.primary : Theme.colors.textSecondary} />
                  <Text style={[drawerStyles.label, active && drawerStyles.labelActive]}>{title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </DrawerContentScrollView>
  );
}

// Custom drawer content — admin gets the sectioned dropdown sidebar; every other
// role keeps the default flat list. Bottom padding clears the floating tab bar.
function DrawerContent(props) {
  const { user } = useAuth();
  if (user?.role === 'admin') return <SectionedAdminDrawer {...props} />;
  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingBottom: 110 }}>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

const drawerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 8, borderRadius: 8,
  },
  rowNested: { paddingLeft: 26, marginVertical: 1 },
  rowActive: { backgroundColor: Theme.colors.primary + '15' },
  label: { fontFamily: Theme.typography.fontFamily, fontSize: 15, color: Theme.colors.textSecondary, fontWeight: '500' },
  labelActive: { color: Theme.colors.primary, fontWeight: '700' },
  section: { marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 4,
  },
  sectionTitle: {
    flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800',
    color: Theme.colors.text, textTransform: 'uppercase', letterSpacing: 0.5,
  },
});

function DrawerNavigator() {
  const { user } = useAuth();
  const cfg = getRoleConfig(user?.role);
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        ...headerStyle,
        drawerActiveTintColor: Theme.colors.primary,
        drawerInactiveTintColor: Theme.colors.textSecondary,
        drawerLabelStyle: { fontFamily: Theme.typography.fontFamily, fontSize: 16 },
        drawerStyle: { backgroundColor: Theme.colors.surface },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeStack}
        options={{ headerShown: false, title: 'Home', drawerIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} /> }}
      />
      {cfg.drawer.map((name) => {
        const Comp = DRAWER_COMPONENTS[name];
        const def = DRAWER_DEFS[name];
        if (!Comp || !def) return null;
        const baseIcon = ({ color }) => <Ionicons name={def.icon} size={22} color={color} />;

        // Presentations has an extra "+" header action.
        if (name === 'PresentationHistory') {
          return (
            <Drawer.Screen
              key={name}
              name={name}
              component={Comp}
              options={({ navigation }) => ({
                title: def.title,
                drawerIcon: baseIcon,
                headerRight: () => (
                  <TouchableOpacity onPress={() => navigation.navigate('PresentationForm')} style={{ marginRight: 16 }}>
                    <Ionicons name="add" size={28} color={Theme.colors.white} />
                  </TouchableOpacity>
                ),
              })}
            />
          );
        }

        // Admin sees company-wide salary spend here, not personal payslips.
        const title = (name === 'MyPayslips' && user?.role === 'admin') ? 'Salary Spend' : def.title;

        return (
          <Drawer.Screen
            key={name}
            name={name}
            component={Comp}
            options={{
              title,
              drawerIcon: baseIcon,
              headerShown: !DRAWER_SCREENS_OWN_HEADER.includes(name),
            }}
          />
        );
      })}
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const navigationRef = useRef(null);
  const roleCfg = getRoleConfig(user?.role);
  const tabs = roleCfg.tabs.map((name) => ({ name, ...TAB_DEFS[name] }));
  const [currentRoute, setCurrentRoute] = useState(roleCfg.landing);

  const onReady = () => {
    if (navigationRef.current) {
      const route = navigationRef.current.getCurrentRoute();
      if (route?.name) setCurrentRoute(route.name);
    }
  };

  const onStateChange = () => {
    if (navigationRef.current) {
      const route = navigationRef.current.getCurrentRoute();
      if (route?.name) setCurrentRoute(route.name);
    }
  };

  // Tapping a chat notification opens that specific conversation (like WhatsApp).
  useEffect(() => {
    const openChat = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (data.type !== 'chat' || !data.chatId) return;
      const id = response?.notification?.request?.identifier || '';
      const last = await AsyncStorage.getItem('handledChatNotif').catch(() => null);
      if (id && id === last) return;            // don't reopen on a later cold start
      if (id) AsyncStorage.setItem('handledChatNotif', id).catch(() => {});
      const go = () => {
        try {
          navigationRef.current?.navigate('ChatRoom', { chatId: data.chatId, chatName: data.chatName });
        } catch (_) { /* nav not ready / not logged in */ }
      };
      if (navigationRef.current?.isReady?.()) go();
      else setTimeout(go, 900);                 // cold start: wait for the navigator
    };
    const sub = Notifications.addNotificationResponseReceivedListener(openChat);
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) openChat(r); }).catch(() => {});
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.background }}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} onReady={onReady} onStateChange={onStateChange}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.colors.background } }}>
          {user ? (
            <>
              <Stack.Screen name="Root" component={DrawerNavigator} />
              <Stack.Screen name="AddLead"               component={AddLeadScreen}               options={({ route }) => ({ headerShown: true, title: route.params?.lead ? 'Edit Lead' : 'Add Lead', ...headerStyle })} />
              <Stack.Screen name="LeadDetail"            component={LeadDetailScreen}            options={{ headerShown: true, title: 'Lead Details', ...headerStyle }} />
              <Stack.Screen name="AddClient"             component={AddClientScreen}             options={({ route }) => ({ headerShown: true, title: route.params?.client ? 'Edit Client' : 'Add Client', ...headerStyle })} />
              <Stack.Screen name="ClientDetail"          component={ClientDetailScreen}          options={{ headerShown: true, title: 'Client Details', ...headerStyle }} />
              <Stack.Screen name="PresentationForm"      component={PresentationFormScreen}      options={{ headerShown: true, title: 'Start Presentation', ...headerStyle }} />
              <Stack.Screen name="PresentationRecording" component={PresentationRecordingScreen} options={{ headerShown: true, title: 'Recording', ...headerStyle }} />
              <Stack.Screen name="ChatRoom"              component={ChatRoomScreen}              options={({ route }) => ({ headerShown: true, title: route.params?.chatName || 'Chat', ...headerStyle })} />
              <Stack.Screen name="NewChat"               component={NewChatScreen}               options={{ headerShown: true, title: 'New Chat', ...headerStyle }} />
              <Stack.Screen name="WhatsAppChat"          component={WhatsAppChatScreen}          options={({ route }) => ({ headerShown: true, title: route.params?.name || route.params?.phone || 'WhatsApp', ...headerStyle, headerStyle: { backgroundColor: '#25D366', elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 } })} />
              <Stack.Screen name="CloseDeal"             component={CloseDealScreen}             options={{ headerShown: true, title: 'Close a Deal', ...headerStyle }} />
              <Stack.Screen name="DealCompleted"         component={DealCompletedScreen}         options={{ headerShown: true, title: 'Deal Completed', ...headerStyle }} />
              <Stack.Screen name="SendWelcome"           component={SendWelcomeLetterScreen}     options={{ headerShown: true, title: 'Welcome Letter', ...headerStyle }} />
              <Stack.Screen name="SendMembership"        component={SendTitaniumCardScreen}      options={{ headerShown: true, title: 'Titanium Card', ...headerStyle }} />
              <Stack.Screen name="TeamMap"               component={TeamMapScreen}               options={{ headerShown: true, title: 'Team Map', ...headerStyle }} />
              <Stack.Screen name="PayrollEmployee"       component={PayrollEmployeeScreen}       options={({ route }) => ({ headerShown: true, title: route.params?.employee?.name || 'Payroll', ...headerStyle })} />
              <Stack.Screen name="PayslipDetail"         component={PayslipDetailScreen}         options={{ headerShown: true, title: 'Payslip', ...headerStyle }} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>

        {/* GlobalTabBar uses currentRoute from onStateChange — no navigator context needed */}
        {user && <GlobalTabBar navigationRef={navigationRef} currentRoute={currentRoute} tabs={tabs} />}

        {/* Headless: reports location every 5 min while punched in (renders nothing) */}
        {user && <LocationReporter />}

        {/* Prompts to update when a newer Play Store version is available */}
        <UpdateChecker />
      </NavigationContainer>
    </View>
  );
}
