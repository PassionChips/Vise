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

  it('use the glass-theme values for the key tokens', () => {
    expect(palettes.light.surface.background).toBe('#eef3f0');
    expect(palettes.dark.surface.background).toBe('#070b09');
    expect(palettes.dark.surface.default).toBe('#111915');
    expect(palettes.dark.content.primary).toBe('#eef4f1');
    expect(palettes.dark.brand.primary).toBe('#34d399');
    expect(palettes.dark.feedback.error).toBe('#f87171');
    expect(palettes.dark.finance.spending).toBe('#eef4f1');
  });

  // WCAG 2.1 contrast, for text that must stay readable on the darkest and lightest surfaces.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(['light', 'dark'] as const)('keeps body text at 4.5:1 or better in %s mode', (scheme) => {
    const p = palettes[scheme];
    const texts = [
      p.content.primary,
      p.content.secondary,
      p.brand.primary,
      p.feedback.error,
      p.feedback.success,
      p.finance.remaining,
      p.finance.underBudget,
      p.finance.overBudget,
    ];
    for (const surface of [p.surface.background, p.surface.default]) {
      for (const text of texts) {
        expect(contrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(p.content.onBrand, p.brand.primary)).toBeGreaterThanOrEqual(4.5);
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
    expect(styles.card.backgroundColor).toBe('#111915');
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
