import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/Theme';

export default function WhatsAppScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="logo-whatsapp" size={64} color="#25D366" />
      </View>
      <Text style={styles.title}>WhatsApp Integration</Text>
      <Text style={styles.subtitle}>Coming Soon</Text>
      <Text style={styles.desc}>
        WhatsApp Business API will be integrated here for bulk messaging, templates, and lead follow-ups.
      </Text>
      <TouchableOpacity
        style={styles.openBtn}
        onPress={() => Linking.openURL('https://wa.me/')}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
        <Text style={styles.openBtnText}>Open WhatsApp</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#25D36615',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: '#25D366',
    marginBottom: 16,
  },
  desc: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#25D366',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  openBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
