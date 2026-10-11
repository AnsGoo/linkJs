import { beforeEach, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin } from '../src/plugins';
import { retryPlugin } from '../src/plugins/retry';

beforeEach(() => {
  linkInstance.plugins = [];
});

test('retries fallback hosts in order and resolves on first success', async () => {
  const calls: (string | undefined)[] = [];
  linkInstance.loadApp = vi.fn(async (_entry: string, opts: { host?: string }) => {
    calls.push(opts.host);
    if (opts.host === 'http://b') {
      return { ok: true };
    }
    throw new Error(`fail ${opts.host}`);
  });

  registerPlugin(retryPlugin({ fallbackHosts: { remote: ['http://b', 'http://c'] } }));
  const result = await linkInstance.loadApp('remote', { host: 'http://a' });

  expect(result).toEqual({ ok: true });
  expect(calls).toEqual(['http://a', 'http://b']);
});

test('throws after all candidates fail and calls onError', async () => {
  const onError = vi.fn();
  linkInstance.loadApp = vi.fn(async () => {
    throw new Error('boom');
  });

  registerPlugin(retryPlugin({ fallbackHosts: { remote: ['http://b'] }, onError }));
  await expect(linkInstance.loadApp('remote', { host: 'http://a' })).rejects.toThrow('boom');
  expect(onError).toHaveBeenCalledWith(expect.any(Error), 'remote');
});

test('retries option caps the number of attempts', async () => {
  const fn = vi.fn(async () => {
    throw new Error('x');
  });
  linkInstance.loadApp = fn;

  registerPlugin(retryPlugin({ fallbackHosts: { remote: ['b', 'c', 'd'] }, retries: 1 }));
  await linkInstance.loadApp('remote', { host: 'a' }).catch(() => undefined);

  // a + b（retries=1 表示首次之外再试 1 次）
  expect(fn).toHaveBeenCalledTimes(2);
});

test('uses global fallback hosts in addition to per-remote ones', async () => {
  const calls: (string | undefined)[] = [];
  linkInstance.loadApp = vi.fn(async (_entry: string, opts: { host?: string }) => {
    calls.push(opts.host);
    if (opts.host === 'global') {
      return 'ok';
    }
    throw new Error('x');
  });

  registerPlugin(retryPlugin({ fallbackHosts: { remote: ['perRemote'] }, fallback: ['global'] }));
  const result = await linkInstance.loadApp('remote', { host: 'primary' });

  expect(result).toBe('ok');
  expect(calls).toEqual(['primary', 'perRemote', 'global']);
});
