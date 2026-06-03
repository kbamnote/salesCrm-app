import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Theme } from '../../theme/Theme';
import { presentationService } from '../../services/presentationService';
import { useAuth } from '../../context/AuthContext';

export default function PresentationHistoryScreen({ navigation }) {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const playSound = async (item) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      
      const uriToPlay = item.localAudioUri || item.audioUrl;
      if (!uriToPlay) {
         Alert.alert("Error", "No audio file available for this presentation.");
         return;
      }
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: uriToPlay },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingId(item.id);
      
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingId(null);
        }
      });
    } catch (error) {
      console.error("Error playing sound", error);
      Alert.alert("Playback Error", "Failed to play the audio file.");
    }
  };

  const stopSound = async () => {
    if (sound) {
      await sound.stopAsync();
      setPlayingId(null);
    }
  };

  const fetchPresentations = async () => {
    setLoading(true);
    try {
      const data = await presentationService.getPresentations();
      setPresentations(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchPresentations();
      refreshUser();
    }, [])
  );

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.customerName}>{item.customerName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.audioUrl ? '#10B981' : '#F59E0B' }]}>
          <Text style={styles.statusText}>{item.audioUrl ? 'Uploaded' : 'Pending'}</Text>
        </View>
      </View>
      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color={Theme.colors.textSecondary || '#666'} />
          <Text style={styles.detailText}>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color={Theme.colors.textSecondary || '#666'} />
          <Text style={styles.detailText}>{formatDuration(item.duration || 0)}</Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.playButton}
        onPress={() => playingId === item.id ? stopSound() : playSound(item)}
      >
        <Ionicons name={playingId === item.id ? "stop-circle" : "play-circle"} size={36} color={Theme.colors.primary || '#3B82F6'} />
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => {
    return (
      <View style={styles.pptContainer}>
        <Text style={styles.sectionTitle}>Assigned Materials (PPTs)</Text>
        {(!user?.ppts || user.ppts.length === 0) ? (
          <Text style={{ color: Theme.colors.textSecondary || '#666', marginBottom: 12 }}>
            No PPTs assigned yet. (User: {user?.name || 'Unknown'})
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
            {user.ppts.map((ppt) => (
              <TouchableOpacity 
                key={ppt._id} 
                style={styles.pptCard}
                onPress={() => Linking.openURL(ppt.url)}
              >
                <Ionicons name="document-text" size={32} color={Theme.colors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.pptTitle} numberOfLines={2}>{ppt.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <Text style={styles.sectionTitle}>Recent Recordings</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={Theme.colors.primary} style={styles.loader} />
      ) : presentations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={64} color={Theme.colors.border || '#ccc'} />
          <Text style={styles.emptyText}>No presentations recorded yet.</Text>
        </View>
      ) : (
        <FlatList
          data={presentations}
          keyExtractor={(item) => item.id || item._id?.toString() || Math.random().toString()}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('PresentationForm')}
      >
        <Ionicons name="add" size={30} color={Theme.colors.white || '#fff'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.surface || '#f5f5f5',
  },
  loader: {
    marginTop: 50,
  },
  pptContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Theme.colors.text || '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  pptCard: {
    backgroundColor: Theme.colors.white || '#fff',
    borderRadius: 8,
    padding: 16,
    marginRight: 12,
    width: 140,
    height: 120,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pptTitle: {
    fontSize: 12,
    textAlign: 'center',
    color: Theme.colors.text || '#333',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: Theme.colors.white || '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Theme.colors.text || '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: Theme.colors.textSecondary || '#666',
  },
  playButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: Theme.colors.textSecondary || '#666',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.colors.primary || '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
