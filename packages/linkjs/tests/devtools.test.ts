import { beforeEach, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerShare } from '../src/share';
import { registerRemote } from '../src/loader';
import {
  buildSnapshot,
  clearDiagnostics,
  getDiagnostics,
  onDiagnostic,
  recordDiagnostic,
} from '../src/devtools';

beforeEach(() => {
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  linkInstance.remotes.clear();
  linkInstance.plugins = [];
  clearDiagnostics();
  vi.restoreAllMocks();
});

test('buildSnapshot reports remotes / shares / plugins', () => {
  registerRemote({ name: 'remote', entry: 'http://localhost:8080/index.html' });
  registerShare({ vue: { name: 'vue', version: '3.5.0', singleton: true, requiredVersion: '^3.0.0', lib: {} } });

  const snapshot = buildSnapshot(linkInstance);
  expect(snapshot.remotes.find((r) => r.name === 'remote')?.status).toBe('unloaded');

  const vue = snapshot.shares.find((s) => s.name === 'vue');
  expect(vue?.versions[0]).toMatchObject({
    version: '3.5.0',
    singleton: true,
    loaded: false,
    requiredVersion: '^3.0.0',
  });
});

test('recordDiagnostic stores, prints, and notifies subscribers', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const seen: { code: string }[] = [];
  const off = onDiagnostic((diagnostic) => seen.push(diagnostic));

  recordDiagnostic({ level: 'warn', code: 'X', message: 'hello' });
  expect(getDiagnostics()).toHaveLength(1);
  expect(seen.map((d) => d.code)).toEqual(['X']);
  expect(warn).toHaveBeenCalled();

  off();
  recordDiagnostic({ level: 'warn', code: 'Y', message: 'bye' });
  expect(seen).toHaveLength(1);

  clearDiagnostics();
  expect(getDiagnostics()).toHaveLength(0);
});
