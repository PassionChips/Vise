import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../theme/tokens';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Avatar: initials on Brand/Subtle. 40px default, 56px on the profile card. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      accessibilityLabel={name}
      style={[styles.avatar, { width: size, height: size }]}
    >
      <Text style={[type.label, { color: color.brand.primary }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: color.brand.subtle,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
