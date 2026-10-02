import {
  Briefcase,
  Bus,
  CircleDot,
  Film,
  House,
  type LucideIcon,
  PiggyBank,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Zap,
} from 'lucide-react-native';

import { color } from '../theme/tokens';

// Lucide names stored in expense_categories.icon → icon component.
const ICONS = {
  briefcase: Briefcase,
  bus: Bus,
  'circle-dot': CircleDot,
  film: Film,
  house: House,
  'piggy-bank': PiggyBank,
  repeat: Repeat,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof ICONS;

interface Props {
  name: string | null;
  size?: number;
  color?: string;
}

export function CategoryIcon({ name, size = 20, color: stroke = color.content.primary }: Props) {
  const Icon = (name && ICONS[name as CategoryIconName]) || CircleDot;
  return <Icon size={size} color={stroke} strokeWidth={2} />;
}
