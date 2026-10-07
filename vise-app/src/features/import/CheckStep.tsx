import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '../../components/Alert';
import { TertiaryButton } from '../../components/Buttons';
import { Card } from '../../components/Card';
import { SegmentedControl } from '../../components/Controls';
import { SelectField } from '../../components/Inputs';
import { SectionHeader } from '../../components/Layout';
import {
  columnOptions,
  columnValue,
  DATE_ORDER_LABELS,
  DECIMAL_LABELS,
  dateNote,
  keyForLabel,
  MAPPING_FIELDS,
  POSITIVE_LABELS,
  setColumn,
  type ImportOptions,
} from '../../data/importFlow';
import { formatMoney } from '../../format';
import type { ImportPreview, ImportSampleRow } from '../../services/types';
import { color, radius, spacing, themed, type } from '../../theme/tokens';

interface Props {
  preview: ImportPreview;
  options: ImportOptions;
  onOptions: (options: ImportOptions) => void;
}

const signed = (row: ImportSampleRow) => (row.transaction_type === 'expense' ? -row.amount_cents : row.amount_cents);

/** Step 2: what was found in the file, and the controls to correct it. */
export function CheckStep({ preview, options, onOptions }: Props) {
  const [showMore, setShowMore] = useState(false);
  const { stats } = preview;
  const columns = columnOptions(preview.columns);
  const shownFields = MAPPING_FIELDS.filter((f) => showMore || !f.more);

  return (
    <>
      <Card style={styles.stats}>
        <Stat value={stats.ready} label="ready to import" />
        <Stat value={stats.duplicates} label="already in VISE" />
        <Stat value={stats.errors} label="can’t be read" tone={stats.errors > 0 ? 'error' : undefined} />
      </Card>

      {preview.warnings.map((warning) => (
        <Alert key={warning} type="warning" title="Check this" description={warning} />
      ))}
      {stats.errors > 0 && (
        <Alert
          type="error"
          title={`${stats.errors} ${stats.errors === 1 ? 'row' : 'rows'} will be left out`}
          description={preview.errors
            .slice(0, 5)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join('\n')}
        />
      )}

      <SectionHeader title="How to read the file" />
      <View style={styles.controls}>
        {preview.mapping.date != null && (
          <Setting label="Dates are written">
            <SegmentedControl
              stretch
              accessibilityLabel="Date order"
              options={Object.values(DATE_ORDER_LABELS)}
              value={DATE_ORDER_LABELS[options.dateOrder ?? preview.date_order]}
              onChange={(label) => onOptions({ ...options, dateOrder: keyForLabel(DATE_ORDER_LABELS, label) })}
            />
          </Setting>
        )}
        <Setting label="Decimal point">
          <SegmentedControl
            stretch
            accessibilityLabel="Decimal point"
            options={Object.values(DECIMAL_LABELS)}
            value={DECIMAL_LABELS[options.decimalSeparator ?? preview.decimal_separator]}
            onChange={(label) => onOptions({ ...options, decimalSeparator: keyForLabel(DECIMAL_LABELS, label) })}
          />
        </Setting>
        {preview.mapping.amount != null && (
          <Setting label="Positive amounts are">
            <SegmentedControl
              stretch
              accessibilityLabel="Positive amounts are"
              options={Object.values(POSITIVE_LABELS)}
              value={POSITIVE_LABELS[options.positiveIs ?? preview.positive_is]}
              onChange={(label) => onOptions({ ...options, positiveIs: keyForLabel(POSITIVE_LABELS, label) })}
            />
          </Setting>
        )}
      </View>

      <SectionHeader title="Columns" />
      <View style={styles.controls}>
        {shownFields.map(({ field, label }) => (
          <SelectField
            key={field}
            label={label}
            options={columns}
            value={columnValue(preview.mapping[field])}
            onChange={(value) => onOptions(setColumn(options, field, value))}
          />
        ))}
        <TertiaryButton
          label={showMore ? 'Show fewer columns' : 'More columns (money out/in, category, type, currency)'}
          onPress={() => setShowMore((v) => !v)}
        />
      </View>

      <SectionHeader title={`Preview (first ${preview.sample.length})`} />
      <Card style={styles.rows}>
        {preview.sample.map((row) => (
          <SampleLine key={row.row} row={row} />
        ))}
      </Card>
    </>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'error' }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.numericMedium, { color: tone === 'error' ? color.feedback.error : color.content.primary }]}>{value}</Text>
      <Text style={[type.bodySmall, styles.secondary]}>{label}</Text>
    </View>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.setting}>
      <Text style={[type.label, styles.secondary]}>{label}</Text>
      {children}
    </View>
  );
}

function SampleLine({ row }: { row: ImportSampleRow }) {
  const note = dateNote(row);
  const amount = signed(row);
  return (
    <View style={styles.line} accessibilityLabel={`${row.date}, ${row.description}, ${formatMoney(amount, { currency: row.currency })}`}>
      <View style={styles.lineText}>
        <Text numberOfLines={1} style={[type.bodyMedium, styles.primary]}>
          {row.description}
          {row.duplicate ? '  · already in VISE' : ''}
        </Text>
        <Text style={[type.bodySmall, styles.secondary]}>
          {row.date}
          {note ? ` · ${note}` : ''}
        </Text>
      </View>
      <Text style={[type.numericSmall, { color: amount < 0 ? color.finance.spending : color.finance.remaining }]}>
        {formatMoney(amount, { sign: 'always', currency: row.currency })}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center', gap: spacing[4] },
  controls: { gap: spacing[16] },
  setting: { gap: spacing[8] },
  rows: { padding: 0, borderRadius: radius.lg },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: color.border.default,
  },
  lineText: { flex: 1, gap: 2 },
}));
