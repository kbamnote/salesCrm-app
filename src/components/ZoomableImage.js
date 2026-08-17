import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

const clamp = (v, lo, hi) => {
  'worklet';
  return Math.min(Math.max(v, lo), hi);
};

/**
 * Full-screen photo viewer with pinch-to-zoom, drag-to-pan and double-tap.
 *
 * Behaviour matches what people expect from a chat app:
 *   - pinch anywhere to zoom between 1x and 5x
 *   - once zoomed in, drag to move around the photo
 *   - double-tap toggles between fit-to-screen and 2.5x
 *   - releasing below 1x springs back to fit, re-centred
 *
 * Panning is bounded so the image can never be flung off-screen and lost.
 * `onZoomChange` lets the parent know whether the user is zoomed in, so a
 * swipe-to-dismiss gesture (if any) can be disabled while panning.
 */
export default function ZoomableImage({ uri, style, onZoomChange }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const notifyZoom = (zoomed) => {
    if (onZoomChange) onZoomChange(zoomed);
  };

  // Keep the image inside the viewport: the further it's zoomed, the more it
  // may travel. At 1x there's no slack, so it stays centred.
  const clampTranslation = (nextScale) => {
    'worklet';
    const maxX = Math.max(0, (SCREEN_W * nextScale - SCREEN_W) / 2);
    const maxY = Math.max(0, (SCREEN_H * nextScale - SCREEN_H) / 2);
    tx.value = clamp(tx.value, -maxX, maxX);
    ty.value = clamp(ty.value, -maxY, maxY);
  };

  const resetToFit = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
    runOnJS(notifyZoom)(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE * 0.8, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) {
        resetToFit();
        return;
      }
      savedScale.value = scale.value;
      clampTranslation(scale.value);
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(notifyZoom)(true);
    });

  // Only pans while zoomed in — at 1x the gesture is ignored so it can't fight
  // with anything the parent might want to do with a plain drag.
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) return;
      clampTranslation(scale.value);
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value > 1) {
        resetToFit();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(notifyZoom)(true);
      }
    });

  // Pinch and pan run together; the double-tap is exclusive so a quick
  // two-finger pinch is never mistaken for taps.
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={styles.container}>
        <Animated.Image
          source={{ uri }}
          style={[styles.image, style, animatedStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
});
