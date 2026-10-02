// Preset avatars people choose instead of uploading a photo.
//
// Only the id is stored (app_settings.avatar, validated by rust-core).
// The ids must match rust-core/contracts/avatars.json and
// service::settings::AVATARS; a test checks all three. Never remove an id
// that may already be stored.

import {
  Bird,
  Cat,
  Dog,
  Fish,
  Moon,
  Panda,
  Rabbit,
  Rocket,
  Sprout,
  Squirrel,
  Sun,
  Turtle,
  type LucideIcon,
} from 'lucide-react-native';

/** Colour pairs from the theme, so avatars work in light and dark mode. */
export type AvatarTone = 'green' | 'teal' | 'amber' | 'red' | 'slate';

export interface AvatarOption {
  id: string;
  /** Spoken by screen readers, e.g. "Cat avatar". */
  label: string;
  icon: LucideIcon;
  tone: AvatarTone;
}

export const AVATARS: readonly AvatarOption[] = [
  { id: 'cat', label: 'Cat', icon: Cat, tone: 'amber' },
  { id: 'dog', label: 'Dog', icon: Dog, tone: 'teal' },
  { id: 'rabbit', label: 'Rabbit', icon: Rabbit, tone: 'green' },
  { id: 'panda', label: 'Panda', icon: Panda, tone: 'slate' },
  { id: 'bird', label: 'Bird', icon: Bird, tone: 'teal' },
  { id: 'fish', label: 'Fish', icon: Fish, tone: 'red' },
  { id: 'turtle', label: 'Turtle', icon: Turtle, tone: 'green' },
  { id: 'squirrel', label: 'Squirrel', icon: Squirrel, tone: 'amber' },
  { id: 'sprout', label: 'Sprout', icon: Sprout, tone: 'green' },
  { id: 'sun', label: 'Sun', icon: Sun, tone: 'amber' },
  { id: 'moon', label: 'Moon', icon: Moon, tone: 'slate' },
  { id: 'rocket', label: 'Rocket', icon: Rocket, tone: 'red' },
];

/** The preset for a stored id; undefined (show initials) for null or an unknown id. */
export function avatarById(id: string | null | undefined): AvatarOption | undefined {
  return id ? AVATARS.find((a) => a.id === id) : undefined;
}
