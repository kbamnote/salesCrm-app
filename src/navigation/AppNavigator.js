import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { Theme } from '../theme/Theme';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Main Tabs
import DashboardScreen from '../screens/main/DashboardScreen';
import LeadsScreen from '../screens/main/LeadsScreen';
import ClientsScreen from '../screens/main/ClientsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import MenuScreen from '../screens/main/MenuScreen';

// Stack screens
import AttendanceScreen from '../screens/main/AttendanceScreen';
import FieldVisitsScreen from '../screens/main/FieldVisitsScreen';
import ChatListScreen from '../screens/main/ChatListScreen';
import ChatRoomScreen from '../screens/main/ChatRoomScreen';
import LiveMapScreen from '../screens/main/LiveMapScreen';
import AddLeadScreen from '../screens/main/AddLeadScreen';
import LeadDetailScreen from '../screens/main/LeadDetailScreen';
import PresentationHistoryScreen from '../screens/main/PresentationHistoryScreen';
import PresentationFormScreen from '../screens/main/PresentationFormScreen';
import PresentationRecordingScreen from '../screens/main/PresentationRecordingScreen';
import AddClientScreen from '../screens/main/AddClientScreen';
import ClientDetailScreen from '../screens/main/ClientDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const headerStyle = {
  headerStyle: { backgroundColor: Theme.colors.primary },
  headerTintColor: Theme.colors.white,
  headerTitleStyle: {
    fontFamily: Theme.typography.fontFamily,
    fontWeight: Theme.typography.weights.bold,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Leads') iconName = focused ? 'funnel' : 'funnel-outline';
          else if (route.name === 'Clients') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'More') iconName = focused ? 'grid' : 'grid-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: Theme.colors.primary,
        tabBarInactiveTintColor: Theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Theme.colors.white,
          borderTopColor: Theme.colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontFamily: Theme.typography.fontFamily,
          fontSize: 11,
        },
        ...headerStyle,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Leads" component={LeadsScreen} />
      <Tab.Screen name="Clients" component={ClientsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="More" component={MenuScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.background }}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />

            {/* Leads */}
            <Stack.Screen
              name="AddLead"
              component={AddLeadScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params?.lead ? 'Edit Lead' : 'Add Lead',
                ...headerStyle,
              })}
            />
            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
              options={{ headerShown: true, title: 'Lead Details', ...headerStyle }}
            />

            {/* Clients */}
            <Stack.Screen
              name="AddClient"
              component={AddClientScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params?.client ? 'Edit Client' : 'Add Client',
                ...headerStyle,
              })}
            />
            <Stack.Screen
              name="ClientDetail"
              component={ClientDetailScreen}
              options={{ headerShown: true, title: 'Client Details', ...headerStyle }}
            />

            {/* More screens */}
            <Stack.Screen
              name="Attendance"
              component={AttendanceScreen}
              options={{ headerShown: true, title: 'My Attendance', ...headerStyle }}
            />
            <Stack.Screen
              name="FieldVisits"
              component={FieldVisitsScreen}
              options={{ headerShown: true, title: 'Field Visits', ...headerStyle }}
            />
            <Stack.Screen
              name="ChatList"
              component={ChatListScreen}
              options={{ headerShown: true, title: 'Team Chat', ...headerStyle }}
            />
            <Stack.Screen
              name="ChatRoom"
              component={ChatRoomScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params?.chatName || 'Chat',
                ...headerStyle,
              })}
            />
            <Stack.Screen
              name="LiveMap"
              component={LiveMapScreen}
              options={{ headerShown: true, title: 'Live Map', ...headerStyle }}
            />
            <Stack.Screen
              name="PresentationHistory"
              component={PresentationHistoryScreen}
              options={{ headerShown: true, title: 'Presentations', ...headerStyle }}
            />
            <Stack.Screen
              name="PresentationForm"
              component={PresentationFormScreen}
              options={{ headerShown: true, title: 'Start Presentation', ...headerStyle }}
            />
            <Stack.Screen
              name="PresentationRecording"
              component={PresentationRecordingScreen}
              options={{ headerShown: true, title: 'Recording', ...headerStyle }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
