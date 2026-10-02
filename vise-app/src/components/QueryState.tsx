// Loading and error states for screens that read from rust-core.

import { CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { Query } from '../data/store';
import { color, spacing, type } from '../theme/tokens';
import { SecondaryButton } from './Buttons';

export function LoadingView() {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.center}>
      <ActivityIndicator color={color.brand.primary} />
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[12], padding: spacing[24] },
  empty: { alignItems: 'center', gap: spacing[8], paddingVertical: spacing[24], paddingHorizontal: spacing[16] },
  title: { color: color.content.primary, textAlign: 'center' },
  message: { color: color.content.secondary, textAlign: 'center' },
});
