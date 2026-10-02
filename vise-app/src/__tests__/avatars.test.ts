import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Icons are components; for these tests their names are enough.
vi.mock('lucide-react-native', () =>
  Object.fromEntries(
    ['Bird', 'Cat', 'Dog', 'Fish', 'Moon', 'Panda', 'Rabbit', 'Rocket', 'Sprout', 'Squirrel', 'Sun', 'Turtle'].map((n) => [n, n]),
  ),
);

import { AVATARS, avatarById } from '../data/avatars';

const contract = JSON.parse(readFileSync(resolve(__dirname, '../../rust-core/contracts/avatars.json'), 'utf8')) as { avatars: string[] };

describe('preset avatars', () => {
  it('match the ids rust-core accepts, in the same order', () => {
    expect(AVATARS.map((a) => a.id)).toEqual(contract.avatars);
  });

  it('have unique ids and labels and an icon each', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(AVATARS.map((a) => a.label)).size).toBe(AVATARS.length);
    expect(AVATARS.every((a) => a.icon)).toBe(true);
  });

  it('fall back to initials for no avatar or an id this build does not know', () => {
    expect(avatarById(null)).toBeUndefined();
    expect(avatarById('')).toBeUndefined();
    expect(avatarById('dragon')).toBeUndefined();
    expect(avatarById('cat')?.label).toBe('Cat');
  });
});
