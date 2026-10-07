import { Text, View } from 'react-native';

import { Alert } from '../../components/Alert';
import { TertiaryButton } from '../../components/Buttons';
import { formatMoney } from '../../format';
import type { ReceiptScan } from '../../services/types';
import { color, spacing, themed, type } from '../../theme/tokens';

interface Props {
  scan: ReceiptScan;
  /** The currency the form is using. */
  currency: string;
  /** The amount now in the form, in cents (null if empty). */
  chosenCents: number | null;
  onPickAmount: (cents: number) => void;
}

/** What the scan found, what is uncertain, and the other amounts to pick from. */
export function ScanNotes({ scan, currency, chosenCents, onPickAmount }: Props) {
  const found = [scan.merchant, scan.date, scan.totals[0] && 'amount'].filter(Boolean).length;
  const others = scan.totals.filter((t) => t.amount_cents !== chosenCents).slice(0, 4);
  return (
    <View style={styles.wrap}>
      <Alert
        type="info"
        title={found === 0 ? 'Nothing could be read' : 'Filled in from your receipt'}
        description={
          found === 0
            ? 'Try again with the receipt flat, well lit and fully in the frame, or enter the details yourself.'
            : 'The photo was read on your phone and not saved. Check the amount, date and category before saving.'
        }
      />
      {scan.warnings.map((warning) => (
        <Alert key={warning} type="warning" title="Check this" description={warning} />
      ))}
      {scan.suggestion && (
        <Text style={[type.bodySmall, styles.secondary]}>
          Category suggested because you usually file {scan.merchant ?? 'this'} under {scan.suggestion.name}.
        </Text>
      )}
      {others.length > 0 && (
        <View style={styles.others}>
          <Text style={[type.label, styles.secondary]}>OTHER AMOUNTS ON THE RECEIPT</Text>
          <View style={styles.chips}>
            {others.map((t) => (
              <TertiaryButton
                key={t.amount_cents}
                label={formatMoney(t.amount_cents, { currency })}
                accessibilityLabel={`Use ${formatMoney(t.amount_cents, { currency })}, from the line ${t.line}`}
                onPress={() => onPickAmount(t.amount_cents)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: spacing[12] },
  secondary: { color: color.content.secondary },
  others: { gap: spacing[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
}));
