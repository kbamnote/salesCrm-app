import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Image, Modal,
  TextInput, Alert, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attendanceApi, usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/Theme';

const { width: SW } = Dimensions.get('window');
const CARD_PAD = 16;
const THUMB_SIZE = 48;

const toDateStr = (d) => d.toISOString().split('T')[0];
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', weekday: 'short',
});
const fmtTime = (t) => {
  if (!t) return '--:--';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const STATUS_COLORS = {
  present: { bg: '#D1FAE5', text: '#065F46', icon: 'checkmark-circle' },
  absent: { bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle' },
  half_day: { bg: '#FEF3C7', text: '#92400E', icon: 'time-outline' },
  leave: { bg: '#DBEAFE', text: '#1E3A8A', icon: 'airplane-outline' },
  wfh: { bg: '#E0E7FF', text: '#3730A3', icon: 'home-outline' },
};
const ROLE_COLORS = {
  admin: '#4a90e2', manager: '#8B5CF6', bdo: '#EC4899', team_leader: '#F59E0B',
  sales: '#10B981', tms: '#06B6D4', tme: '#3B82F6', hr: '#EF4444',
  telecaller: '#F97316', designer: '#A855F7', assistant_hr: '#EC4899',
  social_media: '#F97316',
};

export default function TeamAttendanceScreen() {
  const { user } = useAuth();
  const canChangePassword = user?.role === 'admin' || user?.role === 'hr';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Date selection
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Selfie lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Password change
  const [pwModalUser, setPwModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const insets = useSafeAreaInsets();

  const load = async (date) => {
    try {
      setError(null);
      const dateStr = toDateStr(date || selectedDate);
      const res = await attendanceApi.roster(dateStr);
      setData(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load attendance';
      setError(msg);
      console.log('TeamAttendance load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load(selectedDate);
  }, [selectedDate]));

  const onRefresh = () => {
    setRefreshing(true);
    load(selectedDate);
  };

  const onDateChange = (_event, pickedDate) => {
    setShowDatePicker(Platform.OS === 'android' ? false : true);
    if (pickedDate) {
      setSelectedDate(pickedDate);
      setLoading(true);
      load(pickedDate);
    }
  };

  const goDay = (delta) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setLoading(true);
    load(d);
  };

  const openLightbox = (url) => setLightboxUrl(url);
  const closeLightbox = () => setLightboxUrl(null);

  const openPwModal = (rosterUser) => {
    setPwModalUser(rosterUser);
    setNewPassword('');
  };
  const closePwModal = () => {
    setPwModalUser(null);
    setNewPassword('');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      return Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
    }
    if (!pwModalUser) return;
    setChangingPw(true);
    try {
      await usersApi.changePassword(pwModalUser._id, newPassword);
      Alert.alert('✅ Done', `Password changed for ${pwModalUser.name}`);
      closePwModal();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to change password';
      Alert.alert('Error', msg);
    } finally {
      setChangingPw(false);
    }
  };

  // ─── Loading ───
  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </View>
    );
  }

  // ─── Error ───
  if (error && !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={52} color={Theme.colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(selectedDate); }}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { total, present, absent, roster } = data || {};
  const presentStatuses = ['present', 'wfh', 'half_day'];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banner ── */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="clipboard" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Team Attendance</Text>
            <Text style={styles.bannerSub}>{fmtDate(selectedDate)}</Text>
          </View>
        </View>

        {/* ── Date Navigator ── */}
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => goDay(-1)} style={styles.dateArrow}>
            <Ionicons name="chevron-back" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dateCenter} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
            <Text style={styles.dateText}>{fmtDate(selectedDate)}</Text>
            <Ionicons name="chevron-down" size={14} color={Theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => goDay(1)} style={styles.dateArrow}>
            <Ionicons name="chevron-forward" size={20} color={Theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onDateChange}
          />
        )}

        {/* ── Summary Stats ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: Theme.colors.primary }]}>
            <Text style={styles.statValue}>{total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#10B981' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{present || 0}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#EF4444' }]}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{absent || 0}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
        </View>

        {/* ── Roster ── */}
        {(!roster || roster.length === 0) ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No employees found</Text>
          </View>
        ) : (
          <>
            {/* Section header with count */}
            <View style={styles.listHeader}>
              <Ionicons name="list-outline" size={16} color={Theme.colors.textSecondary} />
              <Text style={styles.listHeaderText}>
                {roster.length} employee{roster.length === 1 ? '' : 's'}
              </Text>
            </View>

            {roster.map((emp) => {
              const sc = STATUS_COLORS[emp.status] || STATUS_COLORS.absent;
              const roleColor = ROLE_COLORS[emp.role] || '#6B7280';
              const initials = (emp.name || '?').substring(0, 2).toUpperCase();

              return (
                <View key={emp._id} style={styles.empCard}>
                  {/* Top row: avatar + info + status */}
                  <View style={styles.empTopRow}>
                    <View style={[styles.avatar, { backgroundColor: roleColor + '20' }]}>
                      <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
                    </View>

                    <View style={styles.empInfo}>
                      <Text style={styles.empName}>{emp.name}</Text>
                      <Text style={[styles.empRole, { color: roleColor }]}>
                        {emp.role.replace(/_/g, ' ')}
                      </Text>
                      {emp.email && (
                        <View style={styles.emailRow}>
                          <Ionicons name="mail-outline" size={11} color={Theme.colors.textSecondary} />
                          <Text style={styles.empEmail}>{emp.email}</Text>
                        </View>
                      )}
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Ionicons name={sc.icon} size={12} color={sc.text} />
                      <Text style={[styles.statusText, { color: sc.text }]}>
                        {emp.status.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>

                  {/* Punch times + selfies */}
                  {(emp.punchIn || emp.punchOut) ? (
                    <View style={styles.punchRow}>
                      {/* Punch In */}
                      <View style={styles.punchBlock}>
                        <View style={styles.punchHeader}>
                          <Ionicons name="log-in-outline" size={13} color="#10B981" />
                          <Text style={styles.punchLabel}>In</Text>
                          <Text style={styles.punchTime}>{fmtTime(emp.punchIn?.time)}</Text>
                        </View>
                        {emp.punchIn?.selfie && (
                          <TouchableOpacity onPress={() => openLightbox(emp.punchIn.selfie)}>
                            <Image
                              source={{ uri: emp.punchIn.selfie }}
                              style={styles.selfieThumb}
                            />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Punch Out */}
                      <View style={styles.punchBlock}>
                        <View style={styles.punchHeader}>
                          <Ionicons name="log-out-outline" size={13} color="#EF4444" />
                          <Text style={styles.punchLabel}>Out</Text>
                          <Text style={styles.punchTime}>{fmtTime(emp.punchOut?.time)}</Text>
                        </View>
                        {emp.punchOut?.selfie && (
                          <TouchableOpacity onPress={() => openLightbox(emp.punchOut.selfie)}>
                            <Image
                              source={{ uri: emp.punchOut.selfie }}
                              style={styles.selfieThumb}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noPunch}>
                      <Ionicons name="time-outline" size={14} color={Theme.colors.textSecondary} />
                      <Text style={styles.noPunchText}>No check-in recorded</Text>
                    </View>
                  )}

                  {/* Change password (admin/HR only) */}
                  {canChangePassword && (
                    <TouchableOpacity
                      style={styles.pwBtn}
                      onPress={() => openPwModal(emp)}
                    >
                      <Ionicons name="key-outline" size={14} color={Theme.colors.primary} />
                      <Text style={styles.pwBtnText}>Change Password</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 120 + insets.bottom }} />
      </ScrollView>

      {/* ─── Selfie Lightbox ─── */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={closeLightbox}>
        <TouchableOpacity style={styles.lightboxOverlay} activeOpacity={1} onPress={closeLightbox}>
          {lightboxUrl && (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ─── Change Password Modal ─── */}
      <Modal visible={!!pwModalUser} transparent animationType="slide" onRequestClose={closePwModal}>
        <View style={styles.pwOverlay}>
          <View style={styles.pwSheet}>
            <View style={styles.pwHeader}>
              <Ionicons name="key-outline" size={22} color={Theme.colors.primary} />
              <Text style={styles.pwTitle}>Change Password</Text>
              <TouchableOpacity onPress={closePwModal}>
                <Ionicons name="close" size={24} color={Theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {pwModalUser && (
              <>
                <View style={styles.pwUserInfo}>
                  <View style={[styles.pwAvatar, { backgroundColor: (ROLE_COLORS[pwModalUser.role] || '#6B7280') + '20' }]}>
                    <Text style={[styles.pwAvatarText, { color: ROLE_COLORS[pwModalUser.role] || '#6B7280' }]}>
                      {(pwModalUser.name || '?').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.pwUserName}>{pwModalUser.name}</Text>
                    <Text style={styles.pwUserRole}>{pwModalUser.role.replace(/_/g, ' ')}</Text>
                    {pwModalUser.email && <Text style={styles.pwUserEmail}>{pwModalUser.email}</Text>}
                  </View>
                </View>

                <Text style={styles.pwLabel}>New Password</Text>
                <TextInput
                  style={styles.pwInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor={Theme.colors.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoFocus
                />

                <TouchableOpacity
                  style={[styles.pwSubmit, (!newPassword || newPassword.length < 6) && styles.pwSubmitDisabled]}
                  onPress={handleChangePassword}
                  disabled={!newPassword || newPassword.length < 6 || changingPw}
                >
                  {changingPw ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.pwSubmitText}>Update Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F5' },
  container: { flex: 1 },
  content: { padding: CARD_PAD },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F0F2F5', padding: 40,
  },
  loadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 12,
  },
  errorText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: Theme.colors.primary, borderRadius: 20,
  },
  retryText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: '#fff', fontWeight: Theme.typography.weights.bold,
  },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Theme.colors.primary,
    borderRadius: 16, padding: 18, marginBottom: 12,
  },
  bannerIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 20, fontWeight: '800', color: '#fff',
  },
  bannerSub: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2,
  },

  // Date navigator
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 8,
    marginBottom: 12, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  dateArrow: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  dateCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  dateText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },

  // Summary stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: 14, borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  statValue: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 24, fontWeight: '800', color: Theme.colors.text,
  },
  statLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, color: Theme.colors.textSecondary,
    marginTop: 2, fontWeight: '600',
  },

  // List header
  listHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10,
  },
  listHeaderText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, fontWeight: '700',
    color: Theme.colors.textSecondary, textTransform: 'uppercase',
  },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 50 },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary, marginTop: 12,
  },

  // Employee card
  empCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  empTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700',
  },
  empInfo: { flex: 1 },
  empName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700', color: Theme.colors.text,
  },
  empRole: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, fontWeight: '600', textTransform: 'capitalize', marginTop: 1,
  },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  empEmail: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10, color: Theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, fontWeight: '700', textTransform: 'capitalize',
  },

  // Punch row
  punchRow: {
    flexDirection: 'row', gap: 20,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  punchBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  punchHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  punchLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10, fontWeight: '700', color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  punchTime: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, fontWeight: '700', color: Theme.colors.text,
  },
  selfieThumb: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  noPunch: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  noPunchText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, color: Theme.colors.textSecondary,
    fontStyle: 'italic',
  },

  // Change password button
  pwBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8,
    borderRadius: 10, backgroundColor: Theme.colors.primary + '10',
    borderWidth: 1, borderColor: Theme.colors.primary + '25',
  },
  pwBtnText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, fontWeight: '700', color: Theme.colors.primary,
  },

  // Lightbox
  lightboxOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center',
    padding: 20,
  },
  lightboxImage: {
    width: SW - 40, height: '80%',
    borderRadius: 12,
  },
  lightboxClose: {
    position: 'absolute', top: 60, right: 20,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  // Password modal
  pwOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pwSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  pwHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 20,
  },
  pwTitle: {
    flex: 1,
    fontFamily: Theme.typography.fontFamily,
    fontSize: 17, fontWeight: '800', color: Theme.colors.text,
  },
  pwUserInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 14, marginBottom: 18,
  },
  pwAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  pwAvatarText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700',
  },
  pwUserName: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 14, fontWeight: '700', color: Theme.colors.text,
  },
  pwUserRole: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11, color: Theme.colors.textSecondary,
    textTransform: 'capitalize', marginTop: 1,
  },
  pwUserEmail: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 10, color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  pwLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 12, fontWeight: '700',
    color: Theme.colors.textSecondary, marginBottom: 8,
  },
  pwInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: Theme.typography.fontFamily,
    fontSize: 16, color: Theme.colors.text,
    marginBottom: 16,
  },
  pwSubmit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12,
    paddingVertical: 14,
  },
  pwSubmitDisabled: { opacity: 0.5 },
  pwSubmitText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 15, fontWeight: '700', color: '#fff',
  },
});
