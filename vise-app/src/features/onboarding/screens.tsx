// The seven onboarding screens from Figma "1 · Onboarding".
// Screens are presentational: state and navigation live in OnboardingFlow.

import { ArrowDownLeft, CircleCheck, Euro, Lock, ReceiptText } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../../components/Buttons';
import { SegmentedControl } from '../../components/Controls';
import { CategoryBudgetCard } from '../../components/FinanceCards';
import { AmountInput, DateField, SelectField, TextField } from '../../components/Inputs';
import { RadioGroup } from '../../components/RadioGroup';
import { SettingsGroup, SettingsRow } from '../../components/Settings';
import { color, radius, spacing, type } from '../../theme/tokens';
import {
  categoryByName,
  currencies,
  currencyByCode,
  displayDate,
  formatTyped,
  starterCategories,
  typedAmountCents,
  type CurrencyCode,
} from './data';
import { Heading, OnboardingScreen, type StepperProps } from './OnboardingScreen';
import type { OnboardingAnswers } from './saveOnboarding';

type FieldErrors = Partial<Record<string, string>>;

// ----- 1.1 Welcome -----

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <OnboardingScreen actions={<PrimaryButton label="Get started" onPress={onStart} />}>
      <View style={styles.flex} />
      <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[type.headingLarge, styles.markGlyph]}>V</Text>
      </View>
      <Text accessibilityRole="header" style={[type.displayLarge, styles.primaryText]}>
        Know where your money goes
      </Text>
      <Text style={[type.bodyLarge, styles.secondaryText]}>
        Track spending, set budgets for what matters, and see where the month is heading — in a minute a day.
      </Text>
      <View style={styles.privacy}>
        <Lock size={16} color={color.content.secondary} />
        <Text style={[type.bodySmall, styles.secondaryText, styles.flex]}>
          No bank login needed. Your data stays on this device.
        </Text>
      </View>
    </OnboardingScreen>
  );
}

// ----- 1.2 Currency -----

const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name} · ${c.symbol}` }));

interface CurrencyScreenProps {
  stepper: StepperProps;
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  onContinue: () => void;
}

export function CurrencyScreen({ stepper, value, onChange, onContinue }: CurrencyScreenProps) {
  return (
    <OnboardingScreen stepper={stepper} actions={<PrimaryButton label="Continue" onPress={onContinue} />}>
      <Heading
        title="Choose your currency"
        description="Amounts are shown in this currency. VISE doesn’t convert between currencies."
      />
      <RadioGroup accessibilityLabel="Currency" options={currencyOptions} value={value} onChange={onChange} />
    </OnboardingScreen>
  );
}

// ----- 1.3 Monthly income -----

interface IncomeScreenProps {
  stepper: StepperProps;
  currency: CurrencyCode;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  errors: FieldErrors;
}

export function MonthlyIncomeScreen({ stepper, currency, value, onChange, onContinue, errors }: IncomeScreenProps) {
  return (
    <OnboardingScreen stepper={stepper} actions={<PrimaryButton label="Continue" onPress={onContinue} />}>
      <Heading
        title="What comes in each month?"
        description="Used to work out what’s left to spend. Optional — skip it and add income as it arrives."
      />
      <AmountInput
        label="Monthly income (after tax)"
        currency={currency}
        currencySymbol={currencyByCode(currency).symbol}
        value={value}
        onChangeText={onChange}
        helperText="You can change this any time in Settings"
        error={errors.monthly_income}
      />
    </OnboardingScreen>
  );
}

// ----- 1.4 First category -----

interface CategoryScreenProps {
  stepper: StepperProps;
  value: string;
  onChange: (name: string) => void;
  onContinue: () => void;
}

const COLUMNS = 3;
const categoryRows = Array.from({ length: Math.ceil(starterCategories.length / COLUMNS) }, (_, i) =>
  starterCategories.slice(i * COLUMNS, i * COLUMNS + COLUMNS),
);

export function FirstCategoryScreen({ stepper, value, onChange, onContinue }: CategoryScreenProps) {
  return (
    <OnboardingScreen stepper={stepper} actions={<PrimaryButton label="Continue" onPress={onContinue} />}>
      <Heading
        title="Pick a category to budget"
        description="Start with one you spend on every week. You can add more later."
      />
      <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={styles.grid}>
        {categoryRows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {Array.from({ length: COLUMNS }, (_, col) => {
              const category = row[col];
              if (!category) return <View key={col} style={[styles.tile, styles.tileEmpty]} />;
              const selected = category.name === value;
              const Icon = category.icon;
              return (
                <Pressable
                  key={category.name}
                  accessibilityRole="radio"
                  accessibilityLabel={category.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onChange(category.name)}
                  style={[styles.tile, selected && styles.tileSelected]}
                >
                  <Icon size={24} color={selected ? color.brand.primary : color.content.primary} />
                  <Text
                    numberOfLines={1}
                    style={[type.bodySmall, { color: selected ? color.brand.primary : color.content.primary }]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </OnboardingScreen>
  );
}

// ----- 1.5 Spending limit -----

/** Default of Settings › Budget warning threshold. */
const WARNING_THRESHOLD = 80;

interface LimitScreenProps {
  stepper: StepperProps;
  currency: CurrencyCode;
  category: string;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  errors: FieldErrors;
}

export function SpendingLimitScreen({ stepper, currency, category, value, onChange, onContinue, errors }: LimitScreenProps) {
  return (
    <OnboardingScreen
      gap={spacing[20]}
      stepper={stepper}
      actions={<PrimaryButton label="Continue" onPress={onContinue} />}
    >
      <Heading
        title={`Set a monthly limit for ${category}`}
        description="We’ll warn you at 80% and tell you clearly if you go over."
      />
      <AmountInput
        label="Monthly limit"
        currency={currency}
        currencySymbol={currencyByCode(currency).symbol}
        value={value}
        onChangeText={onChange}
        helperText="You can change this any time from Budgets"
        error={errors.limit}
      />
      <Text style={[type.label, styles.secondaryText]}>PREVIEW</Text>
      <CategoryBudgetCard
        name={category}
        icon={categoryByName(category).iconName}
        currency={currency}
        spentCents={0}
        limitCents={typedAmountCents(value)}
        warningThreshold={WARNING_THRESHOLD}
      />
    </OnboardingScreen>
  );
}

// ----- 1.6 First transaction -----

type Transaction = NonNullable<OnboardingAnswers['transaction']>;

const typeLabels = { expense: 'Expense', income: 'Income' } as const;
const typeOptions = [typeLabels.expense, typeLabels.income] as const;

const categoryOptions = starterCategories.map((c) => ({ value: c.name, label: c.name, icon: c.icon }));

interface TransactionScreenProps {
  stepper: StepperProps;
  currency: CurrencyCode;
  value: Transaction;
  onChange: (value: Transaction) => void;
  onSubmit: () => void;
  saving: boolean;
  errors: FieldErrors;
}

function relativeDayLabel(date: Date) {
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? `Today, ${displayDate(date)}` : displayDate(date);
}

export function FirstTransactionScreen({
  stepper,
  currency,
  value,
  onChange,
  onSubmit,
  saving,
  errors,
}: TransactionScreenProps) {
  const update = (patch: Partial<Transaction>) => onChange({ ...value, ...patch });
  return (
    <OnboardingScreen
      gap={spacing[20]}
      stepper={stepper}
      actions={
        <>
          {errors.form && (
            <Text accessibilityLiveRegion="polite" style={[type.bodySmall, styles.errorText]}>
              {errors.form}
            </Text>
          )}
          <PrimaryButton label="Add transaction" onPress={onSubmit} loading={saving} />
        </>
      }
    >
      <Heading title="Add your first transaction" description="Something you bought today works well." />
      <SegmentedControl
        stretch
        accessibilityLabel="Transaction type"
        options={typeOptions}
        value={typeLabels[value.type]}
        onChange={(label) => update({ type: label === typeLabels.income ? 'income' : 'expense' })}
      />
      <AmountInput
        label="Amount"
        currency={currency}
        currencySymbol={currencyByCode(currency).symbol}
        value={value.amount}
        onChangeText={(amount) => update({ amount })}
        error={errors.amount}
        autoFocus
      />
      <TextField
        label="Description"
        value={value.description}
        onChangeText={(description) => update({ description })}
        placeholder="e.g. Tesco Express"
        error={errors.description}
      />
      {value.type === 'expense' && (
        <SelectField
          label="Category"
          options={categoryOptions}
          value={value.category}
          onChange={(category) => update({ category })}
          error={errors.expense_category_id}
        />
      )}
      {/* Overlay/DatePicker is not built yet, so the date stays on today. */}
      <DateField label="Date" displayValue={relativeDayLabel(value.date)} error={errors.date} />
    </OnboardingScreen>
  );
}

// ----- 1.7 All set -----

interface AllSetScreenProps {
  userName?: string;
  answers: OnboardingAnswers;
  onFinish: () => void;
}

export function AllSetScreen({ userName, answers, onFinish }: AllSetScreenProps) {
  const { currency } = answers;
  const category = categoryByName(answers.budgetCategory);
  return (
    <OnboardingScreen gap={spacing[20]} actions={<PrimaryButton label="Go to dashboard" onPress={onFinish} />}>
      <View style={styles.allSetSpacer} />
      <View style={styles.illustration}>
        <CircleCheck size={32} color={color.feedback.success} />
      </View>
      <Heading
        title={userName ? `You’re all set, ${userName}` : 'You’re all set'}
        description="Here’s what VISE knows so far. Everything can be changed in Settings."
      />
      <SettingsGroup>
        <SettingsRow type="value" icon={Euro} label="Currency" value={`${currency} (${currencyByCode(currency).symbol})`} />
        <SettingsRow
          type="value"
          icon={ArrowDownLeft}
          label="Monthly income"
          value={answers.monthlyIncome ? formatTyped(answers.monthlyIncome, currency) : 'Not set'}
        />
        <SettingsRow
          type="value"
          icon={category.icon}
          label={`${category.name} limit`}
          value={answers.monthlyLimit ? `${formatTyped(answers.monthlyLimit, currency)} / month` : 'Not set'}
        />
        <SettingsRow
          type="value"
          icon={ReceiptText}
          label="Transactions"
          value={answers.transaction ? '1 added' : 'None yet'}
        />
      </SettingsGroup>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  primaryText: {
    color: color.content.primary,
  },
  secondaryText: {
    color: color.content.secondary,
  },
  errorText: {
    color: color.feedback.error,
    textAlign: 'center',
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: color.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markGlyph: {
    color: color.content.onBrand,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
  },
  grid: {
    gap: spacing[12],
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing[12],
  },
  // Unselected tiles get 1px extra padding to match the 2px selected border,
  // so selecting a tile doesn't shift the grid.
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[8],
    paddingTop: 15,
    paddingBottom: 13,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.default,
    backgroundColor: color.surface.default,
  },
  tileSelected: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: spacing[4] - 1,
    borderWidth: 2,
    borderColor: color.brand.primary,
    backgroundColor: color.brand.subtle,
  },
  // Same box as a tile so every column gets the same width.
  tileEmpty: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  allSetSpacer: {
    height: 80,
  },
  illustration: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: color.feedback.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
