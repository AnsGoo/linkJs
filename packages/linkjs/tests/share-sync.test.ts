import { beforeEach, describe, expect, test } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerShare, loadShare, loadShareSync } from '../src/share';

function reset() {
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  if (linkInstance.shareInflight) {
    linkInstance.shareInflight.clear();
  }
}

describe('loadShareSync', () => {
  beforeEach(reset);

  test('returns null for an unknown module', () => {
    expect(loadShareSync('nope')).toBeNull();
  });

  test('returns an already-loaded instance synchronously', async () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    await loadShare('lodash');

    expect(loadShareSync('lodash')).toEqual({ name: 'v1' });
  });

  test('resolves a synchronous factory and caches it', () => {
    let calls = 0;
    registerShare({
      lodash: {
        version: '1.0.0',
        lib: () => {
          calls++;
          return { name: 'sync' };
        },
      },
    });

    expect(loadShareSync('lodash')).toEqual({ name: 'sync' });
    expect(loadShareSync('lodash')).toEqual({ name: 'sync' });
    expect(calls).toBe(1);
  });

  test('returns a directly-registered module (non-factory)', () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'direct' } } });
    expect(loadShareSync('lodash')).toEqual({ name: 'direct' });
  });

  test('throws when the only candidate is async', () => {
    registerShare({ lodash: { version: '1.0.0', lib: async () => ({ name: 'async' }) } });
    expect(() => loadShareSync('lodash')).toThrow(/cannot resolve synchronously/);
  });

  test('prefers the loaded instance over resolving a new one', async () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1-sync' } } });
    await loadShare('lodash', { version: '1.0.0' });

    // 再注册一个更高版本（同步工厂）：已加载实例优先，不做同步升级。
    registerShare({ lodash: { version: '2.0.0', lib: () => ({ name: 'v2-sync' }) } });
    expect(loadShareSync('lodash')).toEqual({ name: 'v1-sync' });
  });

  test('respects a version range against loaded instances', async () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    await loadShare('lodash', { version: '1.0.0' });

    expect(loadShareSync('lodash', { version: '^1.0.0' })).toEqual({ name: 'v1' });
    expect(loadShareSync('lodash', { version: '^2.0.0' })).toBeNull();
  });

  test('strictVersion throws when the resolved version does not satisfy requiredVersion', () => {
    registerShare({
      lodash: { version: '1.0.0', requiredVersion: '^2.0.0', strictVersion: true, lib: { name: 'v1' } },
    });
    expect(() => loadShareSync('lodash')).toThrow(/does not satisfy requiredVersion/);
  });

  test('isolates modules by scope', () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'app1' }, scope: 'app1' } });
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'app2' }, scope: 'app2' } });

    expect(loadShareSync('lodash', { scope: 'app1' })).toEqual({ name: 'app1' });
    expect(loadShareSync('lodash', { scope: 'app2' })).toEqual({ name: 'app2' });
  });
});
