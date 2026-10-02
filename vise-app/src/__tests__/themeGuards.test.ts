import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the Light/Dark/System appearance: every colour must come from the
// theme tokens and every screen must re-render when the theme changes.

const root = resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))];
const rel = (file: string) => file.replace(root, '').replace(/\\/g, '/');
const read = (file: string) => readFileSync(file, 'utf8');
const isTokens = (file: string) => rel(file) === '/src/theme/tokens.ts';

describe('dark mode guards', () => {
  it('has source files to check', () => expect(files.length).toBeGreaterThan(20));

  it('uses themed() instead of StyleSheet.create, so styles follow the theme', () => {
    const offenders = files.filter((f) => !isTokens(f) && /StyleSheet\.create\(/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('has no hard-coded hex colours outside the tokens', () => {
    const offenders = files
      .filter((f) => !isTokens(f))
      .filter((f) => /['"`]#[0-9a-fA-F]{3,8}['"`]/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('does not copy colour tokens into module-level constants (they would not change with the theme)', () => {
    const offenders = files
      .filter((f) => !isTokens(f))
      .filter((f) => /^(export )?const \w+[^=\n]*=\s*(color\.|\{[^}]*color\.)/m.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('every screen subscribes to theme changes', () => {
    const screens = sourceFiles(join(root, 'app')).filter((f) => /export default function/.test(read(f)) && !/\/app\/_layout\.tsx$/.test(rel(f)));
    expect(screens.length).toBeGreaterThan(5);
    const offenders = screens.filter((f) => !/useTheme\(\)/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the root layout provides the theme', () => {
    expect(read(join(root, 'app/_layout.tsx'))).toMatch(/<ThemeProvider>/);
  });
});
