import { Text, View } from 'react-native';

import { avatarById, type AvatarTone } from '../data/avatars';
import { color, radius, themed, type } from '../theme/tokens';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Background and icon colour for a tone, read while rendering so it follows the theme. */
export function toneColors(tone: AvatarTone): { background: string; foreground: string } {
  switch (tone) {
    case 'green':
      return { background: color.brand.subtle, foreground: color.brand.primary };
    case 'teal':
      return { background: color.feedback.infoSubtle, foreground: color.feedback.info };
    case 'amber':
      return { background: color.feedback.warningSubtle, foreground: color.feedback.warning };
    case 'red':
      return { background: color.feedback.errorSubtle, foreground: color.feedback.error };
    case 'slate':
      return { background: color.surface.variant, foreground: color.content.primary };
  }
}

interface AvatarProps {
  name: string;
  size?: number;
  /** Preset avatar id chosen in Settings; initials are shown when it is null or unknown. */
  avatarId?: string | null;
}

/** Avatar: the chosen preset, otherwise initials on Brand/Subtle. 40px default, 56px on the profile card. */
export function Avatar({ name, size = 40, avatarId }: AvatarProps) {
  const preset = avatarById(avatarId);
  const box = { width: size, height: size };
  if (preset) {
    const { background, foreground } = toneColors(preset.tone);
    const Icon = preset.icon;
    return (
      <View accessibilityLabel={`${name}, ${preset.label} avatar`} style={[styles.avatar, box, { backgroundColor: background }]}>
        <Icon size={Math.round(size * 0.5)} strokeWidth={2} color={foreground} />
      </View>
    );
  }
  return (
    <View accessibilityLabel={name} style={[styles.avatar, box]}>
      <Text style={[type.label, { color: color.brand.primary }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = themed(() => ({
  avatar: {
    backgroundColor: color.brand.subtle,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
