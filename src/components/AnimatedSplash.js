import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Image, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const ICON_SIZE = width * 0.4;

/**
 * Flipkart-style animated splash: the app icon eases in, holds briefly, then
 * zooms up and fades out to reveal the app underneath. Calls onFinish() when
 * the animation completes so the parent can unmount it.
 */
export default function AnimatedSplash({ onFinish }) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;     // icon fade-in
  const overlayOpacity = useRef(new Animated.Value(1)).current; // whole screen fade-out

  useEffect(() => {
    Animated.sequence([
      // 1. Ease the icon in (fade + settle to full size).
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      ]),
      // 2. Hold a beat.
      Animated.delay(350),
      // 3. Zoom the icon up while the whole splash fades away.
      Animated.parallel([
        Animated.timing(scale, { toValue: 9, duration: 550, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    ]).start(() => onFinish && onFinish());
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <Animated.Image
        source={require('../../assets/app-icon.png')}
        style={[styles.icon, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
