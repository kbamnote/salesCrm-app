import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Share, Linking, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { designsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../services/cloudinary';
import { Theme } from '../../theme/Theme';

// Same Cloudinary bucket + unsigned preset the web designer panel uses.
const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';

// Roles the backend allows to POST /api/designs (requireRole on the route).
const UPLOAD_ROLES = ['admin', 'manager', 'designer'];

export default function DesignsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = String(user?._id || user?.id || '');
  const canUpload = UPLOAD_ROLES.includes(user?.role);
  // Delete is allowed for the uploader or an admin (matches the backend rule).
  const canDelete = (item) => user?.role === 'admin' || String(item.uploadedBy) === myId;

  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingId, setSharingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Upload modal state.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [picked, setPicked] = useState(null); // { uri, base64 }
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  // Photos / Videos tabs + reel-post modal state.
  const [tab, setTab] = useState('photos');
  const [reelOpen, setReelOpen] = useState(false);
  const [reelUrl, setReelUrl] = useState('');
  const [reelTitle, setReelTitle] = useState('');
  const [posting, setPosting] = useState(false);

  const load = async () => {
    try {
      const res = await designsApi.list();
      setDesigns(res.data || []);
    } catch (e) {
      console.log('Error loading designs', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const shareDesign = async (item) => {
    setSharingId(item._id);
    try {
      // Download the image to a local file, then share the actual image so it
      // can be sent as a photo (e.g., to WhatsApp), not just a link.
      const ext = (item.imageUrl.split('.').pop() || 'jpg').split('?')[0].slice(0, 4);
      const safeName = (item.title || 'design').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      const fileUri = `${FileSystem.cacheDirectory}${safeName}_${item._id}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(item.imageUrl, fileUri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: item.title, mimeType: 'image/*' });
      } else {
        await Share.share({ message: `${item.title}\n${item.imageUrl}`, url: item.imageUrl });
      }
    } catch (e) {
      // Fallback: share the link via the system share sheet.
      try {
        await Share.share({ message: `${item.title}\n${item.imageUrl}`, url: item.imageUrl });
      } catch (_) {
        Alert.alert('Share failed', 'Could not share this design. Please try again.');
      }
    } finally {
      setSharingId(null);
    }
  };

  // ── Upload ──
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to upload a design.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setPicked(result.assets[0]);
  };

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setPicked(null);
    setTitle('');
  };

  const submitUpload = async () => {
    if (!picked?.base64 || !title.trim()) return;
    setUploading(true);
    try {
      const imageUrl = await uploadToCloudinary(picked.base64, CLOUD_NAME, UPLOAD_PRESET);
      await designsApi.create({ title: title.trim(), imageUrl });
      setUploadOpen(false);
      setPicked(null);
      setTitle('');
      await load();
    } catch (e) {
      Alert.alert('Upload failed', 'Could not upload this design. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ──
  const confirmDelete = (item) => {
    Alert.alert('Delete design?', `"${item.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(item) },
    ]);
  };

  const doDelete = async (item) => {
    setDeletingId(item._id);
    try {
      await designsApi.remove(item._id);
      setDesigns((prev) => prev.filter((d) => d._id !== item._id));
    } catch (e) {
      Alert.alert('Delete failed', 'Could not delete this design. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(item.imageUrl)}>
        <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
      </TouchableOpacity>
      {canDelete(item) && (
        <TouchableOpacity
          style={styles.delBtn}
          onPress={() => confirmDelete(item)}
          disabled={deletingId === item._id}
        >
          {deletingId === item._id
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="trash" size={15} color="#fff" />}
        </TouchableOpacity>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {item.uploaderName ? <Text style={styles.meta}>by {item.uploaderName}</Text> : null}
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => shareDesign(item)}
          disabled={sharingId === item._id}
        >
          {sharingId === item._id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.shareText}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // Split into the two tabs.
  const photos = designs.filter((d) => d.type !== 'video');
  const videos = designs.filter((d) => d.type === 'video');
  const isAdmin = user?.role === 'admin';

  const openReel = (item) => { if (item.reelUrl) Linking.openURL(item.reelUrl).catch(() => {}); };
  const shareReel = async (item) => {
    try { await Share.share({ message: `${item.title}\n${item.reelUrl}`, url: item.reelUrl }); } catch (_) {}
  };

  const closeReel = () => { if (posting) return; setReelOpen(false); setReelUrl(''); setReelTitle(''); };
  const submitReel = async () => {
    const url = reelUrl.trim();
    if (!reelTitle.trim() || !url) return;
    if (!/instagram\.com/i.test(url)) {
      return Alert.alert('Invalid link', 'Please paste a valid Instagram reel link.');
    }
    setPosting(true);
    try {
      await designsApi.create({ type: 'video', title: reelTitle.trim(), reelUrl: url });
      setReelOpen(false); setReelUrl(''); setReelTitle('');
      await load();
      Alert.alert('Reel posted ✅', 'Everyone was notified to like, comment & share it.');
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || 'Could not post the reel.');
    } finally { setPosting(false); }
  };

  const renderReel = ({ item }) => (
    <View style={styles.reelCard}>
      <TouchableOpacity style={styles.reelThumb} activeOpacity={0.9} onPress={() => openReel(item)}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.reelThumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.reelThumbEmpty}><Ionicons name="logo-instagram" size={30} color="#fff" /></View>
        )}
        <View style={styles.playBadge}><Ionicons name="play" size={20} color="#fff" /></View>
      </TouchableOpacity>
      <View style={styles.reelBody}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {item.uploaderName ? <Text style={styles.meta}>by {item.uploaderName}</Text> : null}
        <View style={styles.reelActions}>
          <TouchableOpacity style={styles.reelWatchBtn} onPress={() => openReel(item)}>
            <Ionicons name="logo-instagram" size={16} color="#fff" />
            <Text style={styles.shareText}>Watch &amp; Like</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reelShareBtn} onPress={() => shareReel(item)}>
            <Ionicons name="share-social-outline" size={18} color={Theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      {canDelete(item) && (
        <TouchableOpacity style={styles.delBtn} onPress={() => confirmDelete(item)} disabled={deletingId === item._id}>
          {deletingId === item._id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={15} color="#fff" />}
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.colors.surface }}>
      {/* Photos / Videos tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'photos' && styles.tabActive]} onPress={() => setTab('photos')}>
          <Ionicons name="images-outline" size={16} color={tab === 'photos' ? Theme.colors.primary : Theme.colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'photos' && styles.tabTextActive]}>Photos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'videos' && styles.tabActive]} onPress={() => setTab('videos')}>
          <Ionicons name="videocam-outline" size={16} color={tab === 'videos' ? Theme.colors.primary : Theme.colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'videos' && styles.tabTextActive]}>Videos</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        key={tab}
        style={styles.container}
        data={tab === 'photos' ? photos : videos}
        keyExtractor={(item, i) => item._id || String(i)}
        renderItem={tab === 'photos' ? renderItem : renderReel}
        numColumns={tab === 'photos' ? 2 : 1}
        columnWrapperStyle={tab === 'photos' ? { paddingHorizontal: 8 } : undefined}
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={tab === 'photos' ? 'images-outline' : 'logo-instagram'} size={52} color={Theme.colors.border} />
            <Text style={styles.emptyTitle}>{tab === 'photos' ? 'No designs yet' : 'No reels yet'}</Text>
            <Text style={styles.emptyText}>
              {tab === 'photos'
                ? (canUpload ? 'Tap the + button to upload your first design.' : 'Designs uploaded by the design team will appear here.')
                : (isAdmin ? 'Tap the + button to paste an Instagram reel.' : 'Reels shared by admin appear here — like, comment & share them!')}
            </Text>
          </View>
        }
      />

      {/* FAB — Photos: upload image (designer/admin/manager). Videos: post reel (admin only). */}
      {tab === 'photos' && canUpload && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 76 }]}
          activeOpacity={0.85}
          onPress={() => setUploadOpen(true)}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}
      {tab === 'videos' && isAdmin && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 76 }]}
          activeOpacity={0.85}
          onPress={() => setReelOpen(true)}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Upload modal */}
      <Modal visible={uploadOpen} transparent animationType="slide" onRequestClose={closeUpload}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Upload Design</Text>
              <TouchableOpacity onPress={closeUpload} disabled={uploading}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.picker} onPress={pickImage} activeOpacity={0.8} disabled={uploading}>
              {picked ? (
                <Image source={{ uri: picked.uri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.pickerEmpty}>
                  <Ionicons name="cloud-upload-outline" size={36} color={Theme.colors.primary} />
                  <Text style={styles.pickerText}>Tap to choose an image</Text>
                </View>
              )}
            </TouchableOpacity>
            {picked && !uploading && (
              <TouchableOpacity onPress={pickImage} style={styles.changeLink}>
                <Text style={styles.changeText}>Change image</Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.input}
              placeholder="Design title"
              placeholderTextColor={Theme.colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              editable={!uploading}
            />

            <TouchableOpacity
              style={[styles.uploadBtn, (!picked || !title.trim() || uploading) && styles.uploadBtnDisabled]}
              onPress={submitUpload}
              disabled={!picked || !title.trim() || uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.uploadText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Post-reel modal (admin only) */}
      <Modal visible={reelOpen} transparent animationType="slide" onRequestClose={closeReel}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Post Instagram Reel</Text>
              <TouchableOpacity onPress={closeReel} disabled={posting}>
                <Ionicons name="close" size={24} color={Theme.colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Reel title"
              placeholderTextColor={Theme.colors.textSecondary}
              value={reelTitle}
              onChangeText={setReelTitle}
              editable={!posting}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Paste Instagram reel link"
              placeholderTextColor={Theme.colors.textSecondary}
              value={reelUrl}
              onChangeText={setReelUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!posting}
            />
            <Text style={styles.reelHint}>Everyone will be notified to like, comment &amp; share this reel.</Text>

            <TouchableOpacity
              style={[styles.uploadBtn, (!reelTitle.trim() || !reelUrl.trim() || posting) && styles.uploadBtnDisabled]}
              onPress={submitReel}
              disabled={!reelTitle.trim() || !reelUrl.trim() || posting}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-instagram" size={18} color="#fff" />
                  <Text style={styles.uploadText}>Post Reel &amp; Notify</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.surface },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.l,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  image: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#eee' },
  delBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(220,38,38,0.92)',
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3,
    zIndex: 2,
  },
  cardBody: { padding: 10 },
  title: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  meta: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.m,
    paddingVertical: 8,
    marginTop: 10,
  },
  shareText: { fontFamily: Theme.typography.fontFamily, fontSize: Theme.typography.sizes.s, fontWeight: Theme.typography.weights.bold, color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 30 },
  emptyTitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.m,
  },
  emptyText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  // Upload FAB
  fab: {
    position: 'absolute', right: 18,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  // Upload modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.text },
  picker: {
    height: 200, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Theme.colors.border, borderStyle: 'dashed',
    backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center',
  },
  pickerEmpty: { alignItems: 'center', gap: 8 },
  pickerText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.textSecondary },
  preview: { width: '100%', height: '100%' },
  changeLink: { alignSelf: 'center', paddingVertical: 8 },
  changeText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.primary },
  input: {
    marginTop: 12, borderWidth: 1, borderColor: Theme.colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text,
    backgroundColor: '#F5F7FA',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 16,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },

  // Tabs
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Theme.colors.primary },
  tabText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.textSecondary },
  tabTextActive: { color: Theme.colors.primary },

  // Reel (video) card
  reelCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: Theme.borderRadius.l, marginHorizontal: 12, marginBottom: 12, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  reelThumb: { width: 96, minHeight: 118, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  reelThumbImg: { width: 96, height: '100%' },
  reelThumbEmpty: { width: 96, height: '100%', minHeight: 118, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C13584' },
  playBadge: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  reelBody: { flex: 1, padding: 12 },
  reelActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  reelWatchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#C13584', borderRadius: Theme.borderRadius.m, paddingVertical: 9 },
  reelShareBtn: { width: 42, height: 38, borderRadius: Theme.borderRadius.m, borderWidth: 1, borderColor: Theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  reelHint: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, marginTop: 10, lineHeight: 16 },
});
