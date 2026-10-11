import { beforeEach, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin } from '../src/plugins';
import { loggerPlugin, getLoadMetrics, clearLoadMetrics, type LogEvent } from '../src/plugins/logger';

beforeEach(() => {
  linkInstance.plugins = [];
  clearLoadMetrics();
});

test('records a metric and logs a successful load', async () => {
  linkInstance.loadApp = vi.fn(async () => ({ ok: true }));
  const events: LogEvent[] = [];
  registerPlugin(loggerPlugin({ log: (event) => events.push(event) }));

  const result = await linkInstance.loadApp('remote', { host: 'http://a' });

  expect(result).toEqual({ ok: true });
  expect(getLoadMetrics()[0]).toMatchObject({
    entry: 'remote',
    kind: 'app',
    host: 'http://a',
    status: 'loaded',
  });
  expect(events[0]).toMatchObject({ type: 'load', status: 'loaded' });
});

test('records an error metric and rethrows', async () => {
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });
  const events: LogEvent[] = [];
  registerPlugin(loggerPlugin({ log: (event) => events.push(event) }));

  await expect(linkInstance.loadApp('remote')).rejects.toThrow('boom');
  expect(getLoadMetrics()[0]).toMatchObject({ status: 'error' });
  const event = events[0];
  expect(event.type).toBe('load');
  expect(event.type === 'load' && event.error).toBeInstanceOf(Error);
});

test('logs share and preload events via lifecycle hooks', async () => {
  const events: LogEvent[] = [];
  const plugin = loggerPlugin({ log: (event) => events.push(event) });
  registerPlugin(plugin);

  await plugin.afterLoadShare?.('vue');
  await plugin.afterPreloadRemote?.({}, ['a', 'b']);

  expect(events.map((event) => event.type)).toEqual(['share', 'preload']);
});

test('collect=false does not store metrics', async () => {
  linkInstance.loadApp = vi.fn(async () => null);
  registerPlugin(loggerPlugin({ collect: false, log: () => {} }));
  await linkInstance.loadApp('remote');
  expect(getLoadMetrics()).toHaveLength(0);
});
