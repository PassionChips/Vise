import { CircleAlert, Info, type LucideIcon, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { color, radius, spacing, themed, type } from '../theme/tokens';

type AlertType = 'error' | 'warning' | 'info';

// A function, not a constant: colours must be read at render time so the theme can change.
const variants = (): Record<AlertType, { icon: LucideIcon; bg: string; accent: string; titleColor: string }> => ({
  error: { icon: CircleAlert, bg: color.feedback.errorSubtle, accent: color.feedback.error, titleColor: color.feedback.error },
  warning: { icon: TriangleAlert, bg: color.feedback.warningSubtle, accent: color.feedback.warning, titleColor: color.feedback.warning },
  info: { icon: Info, bg: color.feedback.infoSubtle, accent: color.finance.predicted, titleColor: color.content.primary },
});

interface Props {
  type: AlertType;
  title: string;
  description: string;
}

/** Feedback/Alert: icon + title + text. Error/warning are announced. */
export function Alert({ type: kind, title, description }: Props) {
  const { icon: Icon, bg, accent, titleColor } = variants()[kind];
  return (
    <View
      accessibilityRole={kind === 'info' ? undefined : 'alert'}
      style={[styles.alert, { backgroundColor: bg }]}
    >
      <Icon size={20} strokeWidth={2} color={accent} />
      <View style={styles.text}>
        <Text style={[type.label, { color: titleColor }]}>{title}</Text>
        <Text style={[type.bodySmall, { color: color.content.primary }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: 2 },
}));
