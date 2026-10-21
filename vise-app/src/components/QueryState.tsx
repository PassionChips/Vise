// Loading and error states for screens that read from rust-core.

import { CircleAlert } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import type { Query } from '../data/store';
import { color, radius, spacing, themed, type } from '../theme/tokens';
import { SecondaryButton } from './Buttons';
import { useReduceMotion } from './Glass';

/** One placeholder block with a soft light band sweeping across it. */
function Skeleton({ height, sweep }: { height: number; sweep: Animated.Value }) {
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-320, 420] });
  return (
    <View style={[styles.skeleton, { height }]}>
      <Animated.View style={[styles.shimmer, { transform: [{ translateX }] }]} />
    </View>
  );
}

/** Skeleton cards shaped like a screen's content while rust-core answers. */
export function LoadingView() {
  const reduceMotion = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep]);

  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeletons}>
      <Skeleton height={176} sweep={sweep} />
      <View style={styles.skeletonRow}>
        <View style={styles.flex}>
          <Skeleton height={120} sweep={sweep} />
        </View>
        <View style={styles.flex}>
          <Skeleton height={120} sweep={sweep} />
        </View>
      </View>
      <Skeleton height={220} sweep={sweep} />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.center}>
      <CircleAlert size={32} color={color.feedback.error} />
      <Text style={[type.headingMedium, styles.title]}>Couldn’t load your data</Text>
      <Text style={[type.bodyMedium, styles.message]}>{error.message}</Text>
      <SecondaryButton label="Try again" onPress={onRetry} />
    </View>
  );
}

/** Shows a spinner, then either the error with a retry button or `children(data)`. */
export function QueryState<T>({ query, children }: { query: Query<T>; children: (data: T) => ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error) return <ErrorView error={query.error} onRetry={query.reload} />;
  return <LoadingView />;
}

/** Centered empty-state message with an optional action. */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={[type.headingMedium, styles.title]}>{title}</Text>
      <Text style={[type.bodyMedium, styles.message]}>{description}</Text>
      {action}
    </View>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  skeletons: { flex: 1, gap: spacing[12], paddingTop: spacing[64], paddingHorizontal: spacing[24] },
  skeletonRow: { flexDirection: 'row', gap: spacing[12] },
  skeleton: {
    borderRadius: radius.card,
    backgroundColor: color.glass.fill,
    borderWidth: 1,
    borderColor: color.glass.border,
    overflow: 'hidden',
  },
  shimmer: { width: 200, height: '100%', experimental_backgroundImage: color.gradient.shimmer },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[12], padding: spacing[24] },
  empty: { alignItems: 'center', gap: spacing[8], paddingVertical: spacing[24], paddingHorizontal: spacing[16] },
  title: { color: color.content.primary, textAlign: 'center' },
  message: { color: color.content.secondary, textAlign: 'center' },
}));
