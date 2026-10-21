import { Switch, Text, View } from 'react-native';

import { TextField } from '../../components/Inputs';
import { color, spacing, themed, type } from '../../theme/tokens';

interface Props {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  passphrase: string;
  onPassphrase: (value: string) => void;
  confirmation: string;
  onConfirmation: (value: string) => void;
  /** Shown under the passphrase field (from `passphraseProblem`). */
  error?: string;
}

/** "Protect this backup with a passphrase": off by default, with the cost of forgetting it spelled out. */
export function PassphraseFields({ enabled, onEnabled, passphrase, onPassphrase, confirmation, onConfirmation, error }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={[type.bodyLarge, styles.primary]}>Protect with a passphrase</Text>
          <Text style={[type.bodySmall, styles.secondary]}>
            Recommended if the file is saved where other apps can read it. Only you can open it.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Protect with a passphrase"
          value={enabled}
          onValueChange={onEnabled}
          trackColor={{ true: color.brand.primary }}
        />
      </View>
      {enabled && (
        <>
          <TextField label="Passphrase" value={passphrase} onChangeText={onPassphrase} secureTextEntry error={error} />
          <TextField label="Repeat the passphrase" value={confirmation} onChangeText={onConfirmation} secureTextEntry />
          <Text style={[type.bodySmall, styles.secondary]}>
            VISE can’t recover a forgotten passphrase. Without it the backup can’t be opened by anyone.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  text: { flex: 1, gap: 2 },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
}));
