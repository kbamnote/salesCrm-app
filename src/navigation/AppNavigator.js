import React, { useRef, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { Theme } from '../theme/Theme';
import LocationReporter from '../components/LocationReporter';

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
import PresentationHistoryScreen from '../screens/main/PresentationHistoryScreen';

// Stack-only screens (detail pages)
import AddLeadScreen from '../screens/main/AddLeadScreen';
import LeadDetailScreen from '../screens/main/LeadDetailScreen';
import PresentationFormScreen from '../screens/main/PresentationFormScreen';
import PresentationRecordingScreen from '../screens/main/PresentationRecordingScreen';
import AddClientScreen from '../screens/main/AddClientScreen';
import ClientDetailScreen from '../screens/main/ClientDetailScreen';

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

// Tab screens: screen name → icon set
const TAB_SCREENS = [
  { name: 'Dashboard', active: 'home',   inactive: 'home-outline'   },
  { name: 'Leads',     active: 'funnel', inactive: 'funnel-outline' },
  { name: 'Clients',   active: 'people', inactive: 'people-outline' },
  { name: 'Profile',   active: 'person', inactive: 'person-outline' },
];

// Screens where we do NOT want to show the tab bar (detail/form screens)
const HIDDEN_TAB_SCREENS = [
  'Login', 'AddLead', 'LeadDetail', 'AddClient', 'ClientDetail',
  'PresentationForm', 'PresentationRecording', 'ChatRoom', 'NewChat', 'CloseDeal',
];

/** Global floating tab bar — rendered outside navigation so it appears everywhere */
function GlobalTabBar({ navigationRef, currentRoute }) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 10) + 10;

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
      bottom: bottomOffset,
      left: 20,
      right: 20,
      height: 58,
      backgroundColor: Theme.colors.primary,
      borderRadius: 29,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      elevation: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      paddingHorizontal: 8,
      zIndex: 999,
    }}>
      {TAB_SCREENS.map((tab) => {
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

/** Inner tabs (no visible tab bar — handled by GlobalTabBar) */
const InnerStack = createNativeStackNavigator();
function HomeStack() {
  return (
    <InnerStack.Navigator screenOptions={{ headerShown: false }}>
      <InnerStack.Screen name="Dashboard" component={DashboardScreen} />
      <InnerStack.Screen name="Leads"     component={LeadsScreen}     />
      <InnerStack.Screen name="Clients"   component={ClientsScreen}   />
      <InnerStack.Screen name="Profile"   component={ProfileScreen}   />
    </InnerStack.Navigator>
  );
}

function DrawerNavigator() {
  return (
    <Drawer.Navigator
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
        options={{ headerShown: false, title: 'Dashboard', drawerIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} /> }}
      />
      <Drawer.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: 'My Attendance', drawerIcon: ({ color }) => <Ionicons name="calendar-outline" size={22} color={color} /> }}
      />
      <Drawer.Screen
        name="FieldVisits"
        component={FieldVisitsScreen}
        options={{ title: 'Field Visits', drawerIcon: ({ color }) => <Ionicons name="map-outline" size={22} color={color} /> }}
      />
      <Drawer.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Team Chat', drawerIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} /> }}
      />
      <Drawer.Screen
        name="PresentationHistory"
        component={PresentationHistoryScreen}
        options={({ navigation }) => ({
          title: 'Presentations',
          drawerIcon: ({ color }) => <Ionicons name="mic-outline" size={22} color={color} />,
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('PresentationForm')} style={{ marginRight: 16 }}>
              <Ionicons name="add" size={28} color={Theme.colors.white} />
            </TouchableOpacity>
          ),
        })}
      />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const navigationRef = useRef(null);
  const [currentRoute, setCurrentRoute] = useState('Dashboard');

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
              <Stack.Screen name="CloseDeal"             component={CloseDealScreen}             options={{ headerShown: true, title: 'Close a Deal', ...headerStyle }} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>

        {/* GlobalTabBar uses currentRoute from onStateChange — no navigator context needed */}
        {user && <GlobalTabBar navigationRef={navigationRef} currentRoute={currentRoute} />}

        {/* Headless: reports location every 5 min while punched in (renders nothing) */}
        {user && <LocationReporter />}
      </NavigationContainer>
    </View>
  );
}
