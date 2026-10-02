import {
  Briefcase,
  Bus,
  CircleDot,
  Film,
  GraduationCap,
  HeartPulse,
  House,
  type LucideIcon,
  PiggyBank,
  Plane,
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
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  house: House,
  'piggy-bank': PiggyBank,
  plane: Plane,
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

/** Icon component for a stored icon name; falls back to a dot. */
export function categoryIcon(name: string | null): LucideIcon {
  return (name && ICONS[name as CategoryIconName]) || CircleDot;
}

export function CategoryIcon({ name, size = 20, color: stroke = color.content.primary }: Props) {
  const Icon = categoryIcon(name);
  return <Icon size={size} color={stroke} strokeWidth={2} />;
}
