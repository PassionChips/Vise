import { Plus } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { Alert } from '../src/components/Alert';
import { IconButton } from '../src/components/Buttons';
import { Card } from '../src/components/Card';
import { GoalCard } from '../src/components/FinanceCards';
import { Screen, TopAppBar } from '../src/components/Layout';
import { goals } from '../src/data/demo';
import { formatMoney, percentOf } from '../src/format';
import { color, type } from '../src/theme/tokens';

export default function GoalsScreen() {
  const saved = goals.reduce((sum, g) => sum + g.saved_cents, 0);
  const target = goals.reduce((sum, g) => sum + g.target_cents, 0);

  return (
    <Screen
      header={
        <TopAppBar
          variant="standard"
          title="Goals"
          action={<IconButton icon={Plus} accessibilityLabel="Add goal" filled />}
        />
      }
    >
      <Alert
        type="info"
        title="Goals are trackers"
        description="VISE doesn’t move money. Log what you put aside with “Add to goal”."
      />

      <Card style={styles.total}>
        <Text style={[type.bodySmall, styles.secondary]}>Saved across {goals.length} goals</Text>
        <Text style={[type.numericLarge, { color: color.finance.remaining }]}>{formatMoney(saved)}</Text>
        <Text style={[type.numericSmall, styles.secondary]}>
          of {formatMoney(target)} targeted · {percentOf(saved, target)}%
        </Text>
      </Card>

      {goals.map((g) => (
        <GoalCard
          key={g.id}
          name={g.name}
          icon={g.icon}
          subtitle={g.subtitle}
          savedCents={g.saved_cents}
          targetCents={g.target_cents}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  secondary: { color: color.content.secondary },
  total: { gap: 4 },
});
