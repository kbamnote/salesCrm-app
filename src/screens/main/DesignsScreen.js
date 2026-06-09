import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Share, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { designsApi } from '../../api';
import { Theme } from '../../theme/Theme';

export default function DesignsScreen() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingId, setSharingId] = useState(null);

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

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(item.imageUrl)}>
        <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
      </TouchableOpacity>
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={designs}
      keyExtractor={(item, i) => item._id || String(i)}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={{ paddingHorizontal: 8 }}
      contentContainerStyle={{ paddingVertical: 12, paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Theme.colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={52} color={Theme.colors.border} />
          <Text style={styles.emptyTitle}>No designs yet</Text>
          <Text style={styles.emptyText}>Designs uploaded by the design team will appear here.</Text>
        </View>
      }
    />
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
});
