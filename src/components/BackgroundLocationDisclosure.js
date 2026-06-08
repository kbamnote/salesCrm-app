import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/Theme';

/**
 * Prominent disclosure for background location (Google Play policy requirement).
 * Must be shown BEFORE requesting the background-location permission and must
 * clearly state that location is collected in the background — even when the app
 * is closed or not in use — and what it's used for, with an affirmative choice.
 */
export default function BackgroundLocationDisclosure({ visible, onAccept, onDecline }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={28} color="#fff" />
          </View>

          <Text style={styles.title}>Location sharing while you work</Text>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.body}>
              Tapify Sales Crm collects your location data to share your live work
              location with your manager — <Text style={styles.bold}>even when the app
              is closed or not in use</Text> — so your manager can verify that you are
              present in the field during working hours.
            </Text>

            <View style={styles.point}>
              <Ionicons name="time-outline" size={18} color={Theme.colors.primary} />
              <Text style={styles.pointText}>
                Your location is collected only while you are punched in. It starts when
                you punch in and stops automatically when you punch out.
              </Text>
            </View>
            <View style={styles.point}>
              <Ionicons name="notifications-outline" size={18} color={Theme.colors.primary} />
              <Text style={styles.pointText}>
                An ongoing notification is shown whenever location sharing is active.
              </Text>
            </View>
            <View style={styles.point}>
              <Ionicons name="lock-closed-outline" size={18} color={Theme.colors.primary} />
              <Text style={styles.pointText}>
                Location is shared only with your company managers and is not sold or
                shared with any third parties.
              </Text>
            </View>

            <Text style={styles.note}>
              On the next screen, please choose “Allow all the time” to enable background
              location sharing. You can turn it off any time in your device settings.
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.allowBtn} onPress={onAccept} activeOpacity={0.85}>
            <Text style={styles.allowText}>Allow location sharing</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.7}>
            <Text style={styles.declineText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Theme.spacing.l },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: Theme.spacing.l,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Theme.spacing.m,
  },
  title: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.m,
  },
  body: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.text,
    lineHeight: 21,
    marginBottom: Theme.spacing.m,
  },
  bold: { fontWeight: Theme.typography.weights.bold },
  point: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  pointText: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    lineHeight: 18,
  },
  note: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: Theme.spacing.m,
  },
  allowBtn: {
    width: '100%',
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.m,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  allowText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.m, fontWeight: Theme.typography.weights.bold, color: '#fff' },
  declineBtn: { width: '100%', paddingVertical: 12, alignItems: 'center' },
  declineText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, color: Theme.colors.textSecondary },
});
