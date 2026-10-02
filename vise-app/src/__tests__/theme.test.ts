import { describe, expect, it, vi } from 'vitest';

// tokens.ts only needs StyleSheet.create; count calls to prove styles rebuild per theme.
const created = vi.hoisted(() => ({ count: 0 }));
vi.mock('react-native', () => ({
  StyleSheet: {
    create: <T>(styles: T) => {
      created.count += 1;
      return styles;
    },
  },
}));

import { isThemePreference, resolveScheme } from '../theme/preference';
import { applyColorScheme, color, currentColorScheme, palettes, themed } from '../theme/tokens';

/** Every "group.token" path in a palette. */
function paths(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null ? paths(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('Light and Dark palettes (Figma "Semantic" collection)', () => {
  it('define exactly the same tokens, so no colour is missing in either mode', () => {
    expect(paths(palettes.dark).sort()).toEqual(paths(palettes.light).sort());
  });

  it('use the Figma values for the key tokens', () => {
    expect(palettes.light.surface.background).toBe('#f7f9f7');
    expect(palettes.dark.surface.background).toBe('#101713');
    expect(palettes.dark.surface.default).toBe('#19221c');
    expect(palettes.dark.content.primary).toBe('#f2f6f2');
    expect(palettes.dark.brand.primary).toBe('#3dba6a');
    expect(palettes.dark.feedback.error).toBe('#f07167');
    expect(palettes.dark.finance.spending).toBe('#f2f6f2');
  });

  it('every dark token differs from light except where Figma reuses a value', () => {
    // Only Brand/PrimaryPressed (dark) reuses Brand/Primary (light); text and surfaces must all change.
    expect(palettes.dark.surface).not.toEqual(palettes.light.surface);
    expect(palettes.dark.content).not.toEqual(palettes.light.content);
    expect(palettes.dark.border).not.toEqual(palettes.light.border);
  });
});

describe('switching the colour scheme', () => {
  it('swaps the live `color` tokens in place and back', () => {
    const before = color.surface.background;
    expect(applyColorScheme('dark')).toBe(true);
    expect(currentColorScheme()).toBe('dark');
    expect(color.surface.background).toBe(palettes.dark.surface.background);
    expect(applyColorScheme('dark')).toBe(false); // idempotent
    applyColorScheme('light');
    expect(color.surface.background).toBe(before);
  });

  it('rebuilds `themed` styles after a switch, and only then', () => {
    applyColorScheme('light');
    const styles = themed(() => ({ card: { backgroundColor: color.surface.default } }));

    expect(styles.card.backgroundColor).toBe('#ffffff');
    const builds = created.count;
    expect(styles.card.backgroundColor).toBe('#ffffff');
    expect(created.count).toBe(builds); // cached

    applyColorScheme('dark');
    expect(styles.card.backgroundColor).toBe('#19221c');
    applyColorScheme('light');
    expect(styles.card.backgroundColor).toBe('#ffffff');
  });
});

describe('appearance preference', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['system', undefined, 'light'],
  ] as const)('%s with device %s shows %s', (preference, device, expected) => {
    expect(resolveScheme(preference, device)).toBe(expected);
  });

  it('accepts only the three stored values', () => {
    expect(['system', 'light', 'dark'].every(isThemePreference)).toBe(true);
    expect([undefined, null, '', 'Dark', 'sepia'].some(isThemePreference)).toBe(false);
  });
});
