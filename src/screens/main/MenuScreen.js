import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Theme } from '../../theme/Theme';
import { Ionicons } from '@expo/vector-icons';

export default function MenuScreen({ navigation }) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Features</Text>
      </View>

      <View style={styles.grid}>
        <MenuCard 
          icon="time-outline" 
          title="Attendance" 
          color="#3B82F6" 
          onPress={() => navigation.navigate('Attendance')} 
        />
        <MenuCard 
          icon="location-outline" 
          title="Field Visits" 
          color="#10B981" 
          onPress={() => navigation.navigate('FieldVisits')} 
        />
        <MenuCard 
          icon="chatbubbles-outline" 
          title="Team Chat" 
          color="#8B5CF6" 
          onPress={() => navigation.navigate('ChatList')} 
        />
        <MenuCard 
          icon="map-outline" 
          title="Live Map" 
          color="#F59E0B" 
          onPress={() => navigation.navigate('LiveMap')} 
        />
        <MenuCard 
          icon="mic-outline" 
          title="Presentations" 
          color="#EC4899" 
          onPress={() => navigation.navigate('PresentationHistory')} 
        />
      </View>
    </ScrollView>
  );
}

function MenuCard({ icon, title, color, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={32} color={color} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
  },
  header: {
    padding: Theme.spacing.l,
    backgroundColor: Theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  headerTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xl,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: Theme.spacing.m,
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.l,
    borderRadius: Theme.borderRadius.m,
    alignItems: 'center',
    marginBottom: Theme.spacing.m,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.m,
  },
  cardTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  }
});
