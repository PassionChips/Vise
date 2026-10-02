import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the "no demo data in normal flows" rule: persistent screens must read from rust-core.

const root = resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))];

describe('no demo data in the app', () => {
  it('has source files to check', () => expect(files.length).toBeGreaterThan(20));

  it.each([
    ['imports of a demo data module', /data\/demo/],
    ['demo constants', /DEMO_TODAY|demoTransactions|categoryBudgets\b/],
    ['demo entry points', /Explore with demo|Clear demo data/i],
  ])('contains no %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
  });

  it('never swallows an unavailable core as success', () => {
    const offenders = files
      .filter((file) => /catch[^{]*\{[^}]*bridge_unavailable[^}]*return/.test(readFileSync(file, 'utf8')))
      .map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
  });
});
