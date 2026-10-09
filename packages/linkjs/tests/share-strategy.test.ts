import { describe, expect, test, beforeEach } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerShare, loadShare, getShare } from '../src/share';

function reset() {
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  if (linkInstance.shareInflight) {
    linkInstance.shareInflight.clear();
  }
}

describe('registerShare', () => {
  beforeEach(reset);

  test('singleton: first registration wins, later ignored', () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' }, singleton: true } });
    registerShare({ lodash: { version: '2.0.0', lib: { name: 'v2' }, singleton: true } });

    const scopeMap = linkInstance.shares.get('global');
    expect(scopeMap!.get('lodash')).toHaveLength(1);
    expect(scopeMap!.get('lodash')![0].version).toBe('1.0.0');
  });

  test('non-singleton: multiple versions are kept', () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    registerShare({ lodash: { version: '2.0.0', lib: { name: 'v2' } } });

    const scopeMap = linkInstance.shares.get('global');
    expect(scopeMap!.get('lodash')).toHaveLength(2);
  });
});

describe('loadShare / getShare without version', () => {
  beforeEach(reset);

  test('loaded-first reuses the already loaded version even if a newer one is available', async () => {
    linkInstance.shareStrategy = 'loaded-first';
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    registerShare({ lodash: { version: '2.0.0', lib: { name: 'v2' } } });

    // 先加载 v1
    const first = await loadShare('lodash', { version: '1.0.0' });
    expect(first).toEqual({ name: 'v1' });

    // 未指定版本：应复用已加载的 v1，而不是升级到 v2
    const module = await loadShare('lodash');
    expect(module).toEqual({ name: 'v1' });
  });

  test('version-first upgrades to the highest available version', async () => {
    linkInstance.shareStrategy = 'version-first';
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    registerShare({ lodash: { version: '2.0.0', lib: { name: 'v2' } } });

    await loadShare('lodash', { version: '1.0.0' });

    const module = await loadShare('lodash');
    expect(module).toEqual({ name: 'v2' });
  });
});

describe('loadShare with version', () => {
  beforeEach(reset);

  test('loaded-first prefers a loaded version satisfying the range', async () => {
    linkInstance.shareStrategy = 'loaded-first';
    registerShare({ lodash: { version: '1.2.0', lib: { name: 'v1.2' } } });
    registerShare({ lodash: { version: '1.9.0', lib: { name: 'v1.9' } } });

    await loadShare('lodash', { version: '1.2.0' });

    const module = await loadShare('lodash', { version: '^1.0.0' });
    expect(module).toEqual({ name: 'v1.2' });
  });

  test('version-first picks the highest satisfying version across candidates', async () => {
    linkInstance.shareStrategy = 'version-first';
    registerShare({ lodash: { version: '1.2.0', lib: { name: 'v1.2' } } });
    registerShare({ lodash: { version: '1.9.0', lib: { name: 'v1.9' } } });

    await loadShare('lodash', { version: '1.2.0' });

    const module = await loadShare('lodash', { version: '^1.0.0' });
    expect(module).toEqual({ name: 'v1.9' });
  });

  test('returns null when no version matches', async () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });
    expect(await loadShare('lodash', { version: '^5.0.0' })).toBeNull();
  });

  test('returns null for unknown module', async () => {
    expect(await loadShare('nope')).toBeNull();
  });
});

describe('concurrent loading', () => {
  beforeEach(reset);

  test('merges concurrent loads of the same name@version', async () => {
    linkInstance.shareStrategy = 'loaded-first';
    let loadCount = 0;
    registerShare({
      lodash: {
        version: '4.17.21',
        lib: async () => {
          loadCount++;
          await new Promise((r) => setTimeout(r, 20));
          return { name: 'lodash', loadCount };
        },
      },
    });

    const [a, b] = await Promise.all([loadShare('lodash'), loadShare('lodash')]);
    expect(a).toBe(b);
    expect(loadCount).toBe(1);
  });
});

describe('getShare', () => {
  beforeEach(reset);

  test('returns null before load and latest loaded after load', async () => {
    linkInstance.shareStrategy = 'version-first';
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });

    expect(getShare('lodash')).toBeNull();
    await loadShare('lodash');
    expect(getShare('lodash')).toEqual({ name: 'v1' });
  });

  test('filters by version range and returns null when not loaded', async () => {
    linkInstance.shareStrategy = 'version-first';
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'v1' } } });

    await loadShare('lodash', { version: '1.0.0' });
    expect(getShare('lodash', { version: '^1.0.0' })).toEqual({ name: 'v1' });
    expect(getShare('lodash', { version: '^2.0.0' })).toBeNull();
  });
});

describe('scope isolation', () => {
  beforeEach(reset);

  test('modules in different scopes do not interfere', async () => {
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'app1' }, scope: 'app1' } });
    registerShare({ lodash: { version: '1.0.0', lib: { name: 'app2' }, scope: 'app2' } });

    const a = await loadShare('lodash', { scope: 'app1' });
    const b = await loadShare('lodash', { scope: 'app2' });
    expect(a).toEqual({ name: 'app1' });
    expect(b).toEqual({ name: 'app2' });
  });
});
