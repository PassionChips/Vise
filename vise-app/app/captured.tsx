import { router } from 'expo-router';
import { BellRing, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '../src/components/Alert';
import { IconButton, PrimaryButton, SecondaryButton, TertiaryButton } from '../src/components/Buttons';
import { Card } from '../src/components/Card';
import { SelectField } from '../src/components/Inputs';
import { SectionHeader } from '../src/components/Layout';
import { QueryState } from '../src/components/QueryState';
import { dayLabel } from '../src/data/calendar';
import { categoryOptions, resolveCategory } from '../src/data/pickers';
import { useCoreQuery } from '../src/data/store';
import { formatMoney } from '../src/format';
import { PAYMENT_APPS, captureEnabled, captureSupported, openCaptureSettings } from '../src/services/capture';
import type { CapturedPayment, ExpenseCategory } from '../src/services/types';
import { confirmCaptured, dismissCaptured, getSettings, listCaptured, listCategories } from '../src/services/viseCore';
import { color, spacing, themed, type } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * Payment notifications: switch it on, and review the payments VISE noticed from payment apps. Nothing becomes a
 * transaction until it is confirmed here.
 */
export default function CapturedScreen() {
  useTheme();
  const data = useCoreQuery(async () => ({
    items: await listCaptured(),
    categories: await listCategories(),
    currency: (await getSettings()).currency,
  }));
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[type.headingMedium, styles.title]}>
          Payment notifications
        </Text>
        <View style={styles.barSide}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={() => router.back()} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Status />
        <QueryState query={data}>
          {({ items, categories, currency }) => (
            <>
              <SectionHeader title={items.length > 0 ? `To review (${items.length})` : 'To review'} />
              {items.length === 0 ? (
                <Card>
                  <Text style={[type.bodyMedium, styles.secondary]}>
                    Nothing waiting. When a payment app tells you about a payment, it appears here for you to confirm.
                  </Text>
                </Card>
              ) : (
                items.map((item) => <Item key={item.id} item={item} categories={categories} currency={currency} />)
              )}
            </>
          )}
        </QueryState>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Is it on, what exactly is read, and the way to switch it on. Android asks for this in its own settings screen. */
function Status() {
  const [enabled, setEnabled] = useState(captureEnabled());
  // Switching it on happens in Android settings (or the notification shade): check again when the user comes back,
  // and every couple of seconds while this screen is open.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setEnabled(captureEnabled());
    });
    const timer = setInterval(() => setEnabled(captureEnabled()), 2000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  if (!captureSupported()) {
    return (
      <Alert
        type="info"
        title="Android only"
        description="Reading payment notifications is only possible on Android. On an iPhone, add payments yourself or import a statement."
      />
    );
  }

  return (
    <Card style={styles.status}>
      <View style={styles.statusHead}>
        <BellRing size={20} color={enabled ? color.brand.primary : color.content.secondary} />
        <Text style={[type.headingMedium, styles.primary]}>{enabled ? 'Reading payment notifications' : 'Not reading notifications'}</Text>
      </View>
      <Text style={[type.bodyMedium, styles.secondary]}>
        If you turn this on, VISE reads the title and text of notifications from only these apps, to find the amount and who
        you paid or who paid you:
      </Text>
      <Text style={[type.bodyMedium, styles.primary]}>{PAYMENT_APPS.join(' · ')}</Text>
      <Text style={[type.bodyMedium, styles.secondary]}>
        It reads nothing from other apps, including your bank apps and messages. This happens on your phone and nothing is
        uploaded. A payment is only added after you confirm it, and you can turn this off at any time in Android settings.
      </Text>
      <PrimaryButton label={enabled ? 'Change in Android settings' : 'Turn on in Android settings'} onPress={openCaptureSettings} />
      {!enabled && (
        <Text style={[type.bodySmall, styles.secondary]}>
          On the next screen choose VISE, then switch “Allow notification access” on. Some phones ask you to confirm twice.
        </Text>
      )}
    </Card>
  );
}

function Item({ item, categories, currency }: { item: CapturedPayment; categories: ExpenseCategory[]; currency: string }) {
  const options = categoryOptions(categories);
  const [category, setCategory] = useState<string | null>(item.suggested_category_id != null ? String(item.suggested_category_id) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expense = item.direction === 'expense';
  const amount =
    item.amount_cents == null
      ? null
      : formatMoney(expense ? -item.amount_cents : item.amount_cents, { sign: 'always', currency: item.currency ?? currency });

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const expense_category_id = expense && category ? await resolveCategory(category) : undefined;
      await confirmCaptured({ id: item.id, ...(expense_category_id != null ? { expense_category_id } : {}) });
    } catch (e) {
      setError(message(e, 'Could not add this payment. Try again.'));
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      await dismissCaptured(item.id);
    } catch (e) {
      setError(message(e, 'Could not remove this. Try again.'));
      setBusy(false);
    }
  }

  return (
    <Card style={styles.item}>
      <View style={styles.itemHead}>
        <View style={styles.flex}>
          <Text style={[type.bodyLarge, styles.primary]} numberOfLines={1}>
            {item.merchant ?? (item.understood ? `${item.app_name} payment` : item.app_name)}
          </Text>
          <Text style={[type.bodySmall, styles.secondary]}>
            {item.app_name} · {dayLabel(item.occurred_on)}
          </Text>
        </View>
        {amount && (
          <Text style={[type.numericMedium, { color: expense ? color.content.primary : color.finance.remaining }]}>{amount}</Text>
        )}
      </View>

      {item.possible_duplicate && (
        <Text style={[type.bodySmall, { color: color.feedback.warning }]}>You may already have this payment. Check before adding.</Text>
      )}
      {error && <Alert type="error" title="Couldn’t do that" description={error} />}

      {item.understood ? (
        <>
          {expense && <SelectField label="Category" options={options} value={category} onChange={setCategory} placeholder="Choose a category" />}
          <View style={styles.actions}>
            <PrimaryButton label="Add" loading={busy} onPress={add} style={styles.flex} />
            <TertiaryButton label="Dismiss" size="large" onPress={busy ? undefined : dismiss} />
          </View>
        </>
      ) : (
        <>
          <Text style={[type.bodySmall, styles.secondary]}>VISE could not tell what this was. It said:</Text>
          <Text style={[type.bodyMedium, styles.primary]}>{item.excerpt}</Text>
          <Text style={[type.bodySmall, styles.secondary]}>Add it yourself with + on the Transactions tab if it is a payment.</Text>
          <SecondaryButton label="Dismiss" onPress={busy ? undefined : dismiss} />
        </>
      )}
    </Card>
  );
}

const styles = themed(() => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.surface.background },
  primary: { color: color.content.primary },
  secondary: { color: color.content.secondary },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[16] },
  barSide: { width: 44, alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: color.content.primary },
  body: { gap: spacing[16], paddingHorizontal: spacing[24], paddingTop: spacing[8], paddingBottom: spacing[24] },
  status: { gap: spacing[12] },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  item: { gap: spacing[12] },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
}));
