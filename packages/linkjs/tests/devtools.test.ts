import { beforeEach, expect, test, vi } from 'vitest';
import '../src/index';
import { linkInstance } from '../src/state/instance';
import { registerShare } from '../src/share';
import { registerRemote } from '../src/loader';
import { registerPlugin } from '../src/plugins';
import { retryPlugin } from '../src/plugins/retry';
import {
  buildSnapshot,
  clearDiagnostics,
  clearEvents,
  getDiagnostics,
  getEvents,
  onDiagnostic,
  recordDiagnostic,
} from '../src/devtools';
import { LIB_EXPOSE, REMOTE_UPDATE } from '../src/event-bus/constant';

beforeEach(() => {
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  linkInstance.remotes.clear();
  linkInstance.plugins = [];
  clearDiagnostics();
  clearEvents();
  vi.restoreAllMocks();
});

test('buildSnapshot reports remotes / shares / plugins', () => {
  registerRemote({ name: 'remote', entry: 'http://localhost:8081/index.html' });
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

  // 内置插件目录：未注册时显示为「可用」
  expect(snapshot.availablePlugins.find((p) => p.name === 'linkjs-retry')?.enabled).toBe(false);
});

test('buildSnapshot marks registered plugins as enabled', () => {
  linkInstance.loadApp = (async () => null) as never;
  registerPlugin(retryPlugin());
  const snapshot = buildSnapshot(linkInstance);
  expect(snapshot.plugins).toContain('linkjs-retry');
  expect(snapshot.availablePlugins.find((p) => p.name === 'linkjs-retry')?.enabled).toBe(true);
});

test('buildSnapshot detects share version conflicts and exposes metrics/perf/id', () => {
  registerShare({ 'vue-router': { name: 'vue-router', version: '5.4.0', requiredVersion: '^6.0.0', lib: {} } });

  const snapshot = buildSnapshot(linkInstance);
  const conflict = snapshot.conflicts.find((c) => c.name === 'vue-router');
  expect(conflict).toMatchObject({ requiredVersion: '^6.0.0', provided: ['5.4.0'] });
  expect(Array.isArray(snapshot.metrics)).toBe(true);
  expect(Array.isArray(snapshot.perf)).toBe(true);
  expect(snapshot.instance.id).toMatch(/^linkjs-/);
});

test('records key event-bus events into the snapshot', () => {
  linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'remoteApp', lib: { HelloWorld: 1 } });
  linkInstance.eventBus.emit(REMOTE_UPDATE, { appName: 'remoteApp', key: 'HelloWorld' });

  const events = getEvents();
  expect(events.some((e) => e.type === 'libExpose' && e.summary.includes('remoteApp'))).toBe(true);
  expect(events.some((e) => e.type === 'remoteUpdate' && e.summary === 'remoteApp/HelloWorld')).toBe(true);
  expect(buildSnapshot(linkInstance).events.length).toBeGreaterThanOrEqual(2);
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
