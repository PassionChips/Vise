import { Text, View } from 'react-native';

import { SecondaryButton, TertiaryButton } from '../../components/Buttons';
import { Card } from '../../components/Card';
import { SelectField, type SelectOption } from '../../components/Inputs';
import { SectionHeader } from '../../components/Layout';
import {
  applyValue,
  categorizedRowCount,
  choiceValue,
  NO_CATEGORY,
  suggestedChoices,
} from '../../data/importCategories';
import { categoryOptions } from '../../data/pickers';
import { formatMoney } from '../../format';
import type { ExpenseCategory, ImportCategoryChoice, ImportGroup } from '../../services/types';
import { color, spacing, themed, type } from '../../theme/tokens';

interface Props {
  groups: ImportGroup[];
  categories: ExpenseCategory[];
  currency: string;
  choices: ImportCategoryChoice[];
  onChoices: (choices: ImportCategoryChoice[]) => void;
}

const rowsText = (n: number) => `${n} ${n === 1 ? 'transaction' : 'transactions'}`;

/** Step 3: one category choice per merchant (or per category named in the file), pre-filled with suggestions. */
export function CategoryStep({ groups, categories, currency, choices, onChoices }: Props) {
  const base = categoryOptions(categories);
  const totalRows = groups.reduce((sum, g) => sum + g.rows, 0);
  const done = categorizedRowCount(groups, choices);

  /** Existing and starter categories, plus any new category already chosen that is not among them. */
  const optionsFor = (group: ImportGroup): SelectOption<string>[] => {
    const current = choiceValue(choices, group.key);
    const extra =
      current.startsWith('new:') && !base.some((o) => o.value === current)
        ? [{ value: current, label: `${current.slice(4)} (new)` }]
        : [];
    return [{ value: NO_CATEGORY, label: 'Not categorized' }, ...extra, ...base];
  };

  return (
    <>
      <Card style={styles.summary}>
        <Text style={[type.headingMedium, styles.primary]}>
          {done} of {totalRows} transactions categorized
        </Text>
        <Text style={[type.bodyMedium, styles.secondary]}>
          Rows from the same merchant share one choice. Suggestions are filled in; change any that are wrong, or leave
          groups as “Not categorized”.
        </Text>
        <View style={styles.actions}>
          <SecondaryButton label="Use all suggestions" size="small" onPress={() => onChoices(suggestedChoices(groups))} />
          <TertiaryButton label="Clear all" onPress={() => onChoices([])} />
        </View>
      </Card>

      <SectionHeader title={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`} />
      {groups.map((group) => {
        const suggestion = group.suggestion;
        const hint = suggestion
          ? suggestion.source === 'history'
            ? `You usually file this under ${suggestion.name}`
            : suggestion.is_new
              ? `The file calls this “${suggestion.name}” (new category)`
              : `The file calls this “${suggestion.name}”`
          : null;
        return (
          <View key={group.key} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text numberOfLines={1} style={[type.bodyLarge, styles.primary, styles.flex]}>
                {group.label}
              </Text>
              <Text style={[type.numericSmall, styles.primary]}>{formatMoney(-group.total_cents, { currency })}</Text>
            </View>
            <Text style={[type.bodySmall, styles.secondary]}>
              {rowsText(group.rows)}
              {hint ? ` · ${hint}` : ''}
            </Text>
            <SelectField
              label="Category"
              options={optionsFor(group)}
              value={choiceValue(choices, group.key)}
              onChange={(value) => onChoices(applyValue(choices, group.key, value))}
            />
          </View>
        );
      })}
    </>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  summary: { gap: spacing[8] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], marginTop: spacing[4] },
  group: {
    gap: spacing[8],
    paddingBottom: spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: color.border.default,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
}));
