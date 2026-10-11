import { beforeEach, describe, expect, test } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin, getPlugins, runBeforeLoadRemote, runHook, runInitHooks, type RuntimePlugin } from '../src/plugins';

beforeEach(() => {
  linkInstance.plugins = [];
});

describe('registerPlugin', () => {
  test('registers multiple plugins and dedupes by name', () => {
    registerPlugin([{ name: 'a' }, { name: 'b' }]);
    registerPlugin({ name: 'a' });
    expect(getPlugins().map((plugin) => plugin.name)).toEqual(['a', 'b']);
  });

  test('calls apply(instance) on registration', () => {
    const seen: unknown[] = [];
    registerPlugin({ name: 'a', apply: (instance) => void seen.push(instance) });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(linkInstance);
  });

  test('ignores entries without a valid name', () => {
    registerPlugin([{ name: 'a' }, {} as RuntimePlugin]);
    expect(getPlugins().map((plugin) => plugin.name)).toEqual(['a']);
  });
});

describe('runBeforeLoadRemote', () => {
  test('chains transformations in registration order', async () => {
    registerPlugin([
      { name: 'a', beforeLoadRemote: (info) => ({ ...info, host: 'http://a' }) },
      { name: 'b', beforeLoadRemote: (info) => ({ ...info, host: `${info.host}/b` }) },
    ]);
    const result = await runBeforeLoadRemote({ name: 'remote', entry: '/index.html' });
    expect(result.host).toBe('http://a/b');
  });

  test('a failing plugin is skipped without breaking the chain', async () => {
    registerPlugin([
      {
        name: 'boom',
        beforeLoadRemote: () => {
          throw new Error('boom');
        },
      },
      { name: 'ok', beforeLoadRemote: (info) => ({ ...info, host: 'http://ok' }) },
    ]);
    const result = await runBeforeLoadRemote({ name: 'remote', entry: '/index.html' });
    expect(result.host).toBe('http://ok');
  });
});

describe('runHook', () => {
  test('invokes the hook on every plugin in order', async () => {
    const calls: string[] = [];
    registerPlugin([
      { name: 'a', beforeLoadEntry: () => void calls.push('a') },
      { name: 'b', beforeLoadEntry: () => void calls.push('b') },
    ]);
    await runHook('beforeLoadEntry', {});
    expect(calls).toEqual(['a', 'b']);
  });

  test('passes hook args through', async () => {
    let received: unknown[] = [];
    registerPlugin({ name: 'a', afterLoadShare: (...args) => void (received = args) });
    await runHook('afterLoadShare', 'vue', { default: {} });
    expect(received).toEqual(['vue', { default: {} }]);
  });

  test('swallows hook errors', async () => {
    registerPlugin({
      name: 'boom',
      afterLoadShare: () => {
        throw new Error('boom');
      },
    });
    await expect(runHook('afterLoadShare', 'vue')).resolves.toBeUndefined();
  });
});

describe('runInitHooks', () => {
  test('calls beforeInit then afterInit', () => {
    const order: string[] = [];
    registerPlugin({
      name: 'a',
      beforeInit: () => void order.push('before'),
      afterInit: () => void order.push('after'),
    });
    runInitHooks({ mode: 'development' }, {});
    expect(order).toEqual(['before', 'after']);
  });
});
