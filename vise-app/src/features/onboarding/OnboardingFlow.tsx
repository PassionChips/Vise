import { useState } from 'react';

import { ViseError } from '../../services/viseCore';
import { saveOnboarding, type OnboardingAnswers } from './saveOnboarding';
import {
  AllSetScreen,
  CurrencyScreen,
  FirstCategoryScreen,
  FirstTransactionScreen,
  MonthlyIncomeScreen,
  SpendingLimitScreen,
  WelcomeScreen,
} from './screens';

type Step = 'welcome' | 'currency' | 'income' | 'category' | 'limit' | 'transaction' | 'done';

const numberedSteps: Step[] = ['currency', 'income', 'category', 'limit', 'transaction'];

/** Which step owns each rust-core validation field, so errors land on the right screen. */
const fieldStep: Record<string, Step> = {
  monthly_income: 'income',
  budget_category: 'category',
  limit: 'limit',
  transaction_type: 'transaction',
  amount: 'transaction',
  description: 'transaction',
  date: 'transaction',
  expense_category_id: 'transaction',
};

interface OnboardingFlowProps {
  userName?: string;
  onFinish: (answers: OnboardingAnswers) => void;
}

export function OnboardingFlow({ userName, onFinish }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    currency: 'EUR',
    monthlyIncome: '',
    budgetCategory: 'Groceries',
    monthlyLimit: '',
    transaction: null,
  });
  const [transaction, setTransaction] = useState<NonNullable<OnboardingAnswers['transaction']>>({
    type: 'expense',
    amount: '',
    description: '',
    category: 'Groceries',
    date: new Date(),
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<OnboardingAnswers>) => setAnswers((prev) => ({ ...prev, ...patch }));

  const save = async (final: OnboardingAnswers) => {
    setSaving(true);
    setErrors({});
    try {
      await saveOnboarding(final);
      setAnswers(final);
      setStep('done');
    } catch (error) {
      if (error instanceof ViseError && error.field && fieldStep[error.field]) {
        setErrors({ [error.field]: error.message });
        setStep(fieldStep[error.field]);
      } else {
        setErrors({ form: error instanceof Error ? error.message : 'Something went wrong. Try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const index = numberedSteps.indexOf(step);
  const stepper = {
    step: index + 1,
    total: numberedSteps.length,
    onBack: () => setStep(index > 0 ? numberedSteps[index - 1] : 'welcome'),
    // Skipping the last step saves without a transaction.
    onSkip: () =>
      index < numberedSteps.length - 1 ? setStep(numberedSteps[index + 1]) : save({ ...answers, transaction: null }),
  };
  const next = () => setStep(numberedSteps[index + 1]);

  switch (step) {
    case 'welcome':
      return <WelcomeScreen onStart={() => setStep('currency')} />;
    case 'currency':
      return (
        <CurrencyScreen
          stepper={stepper}
          value={answers.currency}
          onChange={(currency) => update({ currency })}
          onContinue={next}
        />
      );
    case 'income':
      return (
        <MonthlyIncomeScreen
          stepper={stepper}
          currency={answers.currency}
          value={answers.monthlyIncome}
          onChange={(monthlyIncome) => update({ monthlyIncome })}
          onContinue={next}
          errors={errors}
        />
      );
    case 'category':
      return (
        <FirstCategoryScreen
          stepper={stepper}
          value={answers.budgetCategory}
          onChange={(budgetCategory) => {
            update({ budgetCategory });
            setTransaction((prev) => ({ ...prev, category: budgetCategory }));
          }}
          onContinue={next}
        />
      );
    case 'limit':
      return (
        <SpendingLimitScreen
          stepper={stepper}
          currency={answers.currency}
          category={answers.budgetCategory}
          value={answers.monthlyLimit}
          onChange={(monthlyLimit) => update({ monthlyLimit })}
          onContinue={next}
          errors={errors}
        />
      );
    case 'transaction':
      return (
        <FirstTransactionScreen
          stepper={stepper}
          currency={answers.currency}
          value={transaction}
          onChange={setTransaction}
          onSubmit={() => save({ ...answers, transaction })}
          saving={saving}
          errors={errors}
        />
      );
    case 'done':
      return <AllSetScreen userName={userName} answers={answers} onFinish={() => onFinish(answers)} />;
  }
}
