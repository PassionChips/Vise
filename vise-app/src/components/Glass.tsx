// The "glass" look: translucent, blurred containers over soft ambient light, and the
// press animation used by every tappable control. Purely visual; no behaviour lives here.
//
// Blur: iOS blurs whatever is behind a BlurView. Android (expo-blur) can only blur a separate
// "target" view that does not contain the BlurView, so there the tab bar blurs the focused
// screen (registered through BlurHost) and cards fall back to their translucent fill.

import { BlurTargetView, BlurView, type BlurTint } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { color, motion, radius, themed } from '../theme/tokens';

// ----- Reduce motion -----

/** True when the device asks for reduced motion; animations are then skipped. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => live && setReduce(value)).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

// ----- Blur host (tab screens) -----

interface BlurHostValue {
  /** The focused screen's content, for the tab bar to blur on Android. */
  target: RefObject<View | null> | null;
  setTarget: (target: RefObject<View | null>) => void;
  /** Space the floating tab bar covers at the bottom of each screen. */
  bottomInset: number;
  setBottomInset: (height: number) => void;
}

const BlurHostContext = createContext<BlurHostValue | null>(null);

/** Wraps the tab navigator: shares the blur target and the tab bar's height. */
export function BlurHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<RefObject<View | null> | null>(null);
  const [bottomInset, setBottomInset] = useState(0);
  const value = useMemo(() => ({ target, setTarget, bottomInset, setBottomInset }), [target, bottomInset]);
  return <BlurHostContext.Provider value={value}>{children}</BlurHostContext.Provider>;
}

export const useBlurHost = () => useContext(BlurHostContext);

/** A tab screen's content. On Android it is the view the tab bar blurs while the screen is focused. */
export function BlurTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const host = useBlurHost();
  const ref = useRef<View | null>(null);
  const setTarget = host?.setTarget;
  useFocusEffect(
    useCallback(() => {
      setTarget?.(ref);
    }, [setTarget]),
  );
  if (!host) return <View style={style}>{children}</View>;
  return (
    <BlurTargetView ref={ref} style={style}>
      {children}
    </BlurTargetView>
  );
}

// ----- Glass surface -----

interface GlassSurfaceProps extends Omit<ViewProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Tab bar and sheets: a more opaque fill so text stays readable over busy content. */
  strong?: boolean;
  /** Android only: the view to blur. Without it Android shows the translucent fill alone. */
  blurTarget?: RefObject<View | null> | null;
  /** Blur strength, 1–100. */
  intensity?: number;
}

/**
 * Glass container: blur + translucent fill + hairline border + a light top edge + soft shadow.
 * Layout (padding, radius, flex) comes from `style`; the layers sit behind the children.
 */
export function GlassSurface({ children, style, strong, blurTarget, intensity = 40, ...rest }: GlassSurfaceProps) {
  const blur =
    Platform.OS === 'ios' ? (
      <BlurView tint={color.glass.tint as BlurTint} intensity={intensity} style={StyleSheet.absoluteFill} />
    ) : Platform.OS === 'android' && blurTarget ? (
      <BlurView
        tint={color.glass.tint as BlurTint}
        intensity={intensity}
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={StyleSheet.absoluteFill}
      />
    ) : null;
  return (
    <View {...rest} style={[styles.surface, style]}>
      {blur}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: strong ? color.glass.fillStrong : color.glass.fill }]} />
      <View pointerEvents="none" style={styles.highlight} />
      {children}
    </View>
  );
}

// ----- Ambient glow -----

/** Rings from the outside in; stacked, they fade like a radial gradient without extra native code. */
const GLOW_RINGS = [1, 0.8, 0.62, 0.46, 0.32];

function Glow({ size, tint, style }: { size: number; tint: string; style: ViewStyle }) {
  return (
    <View pointerEvents="none" style={[styles.glow, { width: size, height: size }, style]}>
      {GLOW_RINGS.map((scale) => (
        <View
          key={scale}
          style={[
            styles.glowRing,
            { width: size * scale, height: size * scale, backgroundColor: tint, opacity: 0.22 },
          ]}
        />
      ))}
    </View>
  );
}

/** Soft emerald and teal light behind a screen's content; the glass cards blur it as they scroll. */
export function AmbientGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Glow size={420} tint={color.glass.glowPrimary} style={{ top: -160, right: -140 }} />
      <Glow size={360} tint={color.glass.glowSecondary} style={{ top: 360, left: -180 }} />
    </View>
  );
}

// ----- Press feedback -----

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Added while the finger is down (e.g. a darker fill). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** How far it shrinks; 1 turns the scale off (rows in a list only tint). */
  scaleTo?: number;
}

/** Pressable that shrinks slightly while held and springs back on release. */
export function PressableScale({ style, pressedStyle, scaleTo = motion.pressScale, onPressIn, onPressOut, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReduceMotion();
  const animate = scaleTo !== 1 && !reduceMotion;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        if (animate) Animated.timing(scale, { toValue: scaleTo, duration: motion.pressIn, useNativeDriver: true }).start();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        if (animate) Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 6, useNativeDriver: true }).start();
        onPressOut?.(event);
      }}
      style={[style, pressed && pressedStyle, animate && { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Fades and lifts its children in when `trigger` changes (e.g. a new month); instant with reduce motion. */
export function FadeIn({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: motion.enter, useNativeDriver: true }).start();
  }, [trigger, reduceMotion, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const styles = themed(() => ({
  surface: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.glass.border,
    overflow: 'hidden',
    boxShadow: color.glass.shadow,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: color.glass.highlight,
  },
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glowRing: { position: 'absolute', borderRadius: radius.full },
}));
