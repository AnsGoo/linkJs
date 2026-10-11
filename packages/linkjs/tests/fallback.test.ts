import { beforeEach, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin } from '../src/plugins';
import { fallbackPlugin } from '../src/plugins/fallback';

beforeEach(() => {
  linkInstance.plugins = [];
});

test('resolves a provided fallback value on failure', async () => {
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });

  registerPlugin(fallbackPlugin({ fallback: { remote: { name: 'offline' } } }));
  await expect(linkInstance.loadApp('remote')).resolves.toEqual({ name: 'offline' });
});

test('fallback factory receives (error, entry)', async () => {
  linkInstance.loadLib = vi.fn(async () => {
    throw new Error('boom');
  });
  const factory = vi.fn((error: unknown, entry: string) => ({ entry, message: (error as Error).message }));

  registerPlugin(fallbackPlugin({ fallback: { 'remote-lib': factory } }));
  await expect(linkInstance.loadLib('remote-lib/HelloWorld')).resolves.toEqual({
    entry: 'remote-lib/HelloWorld',
    message: 'boom',
  });
  expect(factory).toHaveBeenCalledWith(expect.any(Error), 'remote-lib/HelloWorld');
});

test('uses a mountable placeholder by default', async () => {
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });

  registerPlugin(fallbackPlugin());
  const mod = (await linkInstance.loadApp('remote')) as { __linkjsFallback?: boolean; mount: (el: unknown) => void };
  expect(mod.__linkjsFallback).toBe(true);
  expect(typeof mod.mount).toBe('function');
  expect(() => mod.mount({})).not.toThrow();
});

test('rethrows when defaultFallback is false and no fallback is provided', async () => {
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });

  registerPlugin(fallbackPlugin({ defaultFallback: false }));
  await expect(linkInstance.loadApp('remote')).rejects.toThrow('boom');
});

test('calls onError on failure', async () => {
  const onError = vi.fn();
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });

  registerPlugin(fallbackPlugin({ onError, fallback: { remote: {} } }));
  await linkInstance.loadApp('remote');
  expect(onError).toHaveBeenCalledWith(expect.any(Error), 'remote');
});
