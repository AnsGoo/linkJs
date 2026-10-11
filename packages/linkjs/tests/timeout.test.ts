import { beforeEach, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin } from '../src/plugins';
import { timeoutPlugin, TimeoutError } from '../src/plugins/timeout';

beforeEach(() => {
  linkInstance.plugins = [];
});

test('passes through when the load resolves within the timeout', async () => {
  linkInstance.loadApp = vi.fn(async () => 'ok');
  registerPlugin(timeoutPlugin({ timeout: 1000 }));
  await expect(linkInstance.loadApp('remote')).resolves.toBe('ok');
});

test('rejects with TimeoutError and calls onTimeout when too slow', async () => {
  const onTimeout = vi.fn();
  linkInstance.loadApp = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('late'), 200)));
  registerPlugin(timeoutPlugin({ timeout: 30, onTimeout }));

  await expect(linkInstance.loadApp('remote')).rejects.toBeInstanceOf(TimeoutError);
  expect(onTimeout).toHaveBeenCalledWith({ entry: 'remote', timeout: 30, kind: 'app' });
});

test('passes an AbortSignal and aborts it on timeout', async () => {
  let signal: AbortSignal | undefined;
  linkInstance.loadApp = vi.fn(
    (_entry: string, opts: { signal?: AbortSignal }) =>
      new Promise((_resolve) => {
        signal = opts.signal;
      }),
  );
  registerPlugin(timeoutPlugin({ timeout: 20 }));

  await expect(linkInstance.loadApp('remote')).rejects.toBeInstanceOf(TimeoutError);
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal?.aborted).toBe(true);
});

test('timeout 0 disables the limit', async () => {
  const fn = vi.fn(async () => 'ok');
  linkInstance.loadApp = fn;
  registerPlugin(timeoutPlugin({ timeout: 0 }));
  await expect(linkInstance.loadApp('remote')).resolves.toBe('ok');
  expect(fn).toHaveBeenCalledTimes(1);
});
