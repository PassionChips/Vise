// Animated launch: takes over from the native splash (same logo, same place, same background),
// then reveals the wordmark and dissolves into the app. Visual only; the app is already
// rendering underneath. With reduce motion it just fades.

import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image } from 'react-native';

import { fontFamily, launch, themed } from '../theme/tokens';
import { useReduceMotion } from './Glass';

/** Matches `imageWidth` of the expo-splash-screen plugin in app.json, so the hand-over is seamless. */
const LOGO_SIZE = 160;

export function LaunchScreen({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReduceMotion();
  const logo = useRef(new Animated.Value(0)).current; // 0 = native splash pose, 1 = settled
  const words = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => {});
    const leave = Animated.timing(exit, {
      toValue: 1,
      duration: reduceMotion ? 200 : 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    const sequence = reduceMotion
      ? Animated.sequence([Animated.delay(250), leave])
      : Animated.sequence([
          Animated.parallel([
            Animated.spring(logo, { toValue: 1, speed: 6, bounciness: 8, useNativeDriver: true }),
            Animated.timing(words, {
              toValue: 1,
              duration: 520,
              delay: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(320),
          leave,
        ]);
    sequence.start(() => onDone());
  };

  // Never leave the user staring at the launch screen if something stalls.
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [onDone]);

  const logoScale = Animated.multiply(
    logo.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
  );
  const logoLift = logo.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  const glowScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const wordsLift = words.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View
      accessible
      accessibilityLabel="VISE"
      onLayout={start}
      style={[styles.root, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <Animated.View style={[styles.glow, { opacity: logo, transform: [{ scale: glowScale }] }]} />
      <Animated.View style={{ transform: [{ translateY: logoLift }, { scale: logoScale }] }}>
        <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
      </Animated.View>
      <Animated.View style={[styles.words, { opacity: words, transform: [{ translateY: wordsLift }] }]}>
        <Animated.Text style={styles.wordmark}>VISE</Animated.Text>
        <Animated.Text style={styles.tagline}>Your money, clearly.</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

// Fixed colours (see `launch` in tokens): this screen is the same in light and dark.
const styles = themed(() => ({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: launch.background,
  },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    experimental_backgroundImage: launch.glow,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  words: { position: 'absolute', top: '50%', marginTop: 44, alignItems: 'center', gap: 6 },
  wordmark: {
    fontFamily: fontFamily.uiBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 8,
    color: launch.wordmark,
  },
  tagline: { fontFamily: fontFamily.uiMedium, fontSize: 14, lineHeight: 20, color: launch.tagline },
}));

/** Call at module load: keeps the native splash up until the launch screen replaces it. */
export const keepNativeSplash = () => SplashScreen.preventAutoHideAsync().catch(() => {});
