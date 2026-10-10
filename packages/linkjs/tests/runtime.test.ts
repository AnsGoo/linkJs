import { expect, test, beforeEach } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { loadRuntime, resetRuntimeCache } from '../src/runtime';
import { registerShare } from '../src/share';

beforeEach(() => {
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  linkInstance.mode = 'production';
  resetRuntimeCache();
});

test('production mode falls back to the local loader', async () => {
  linkInstance.mode = 'production';
  registerShare({ vue: { name: 'vue', lib: () => ({ tag: 'shared' }) } });

  const local = { tag: 'local' };
  const result = await loadRuntime('vue', async () => local);

  expect(result).toBe(local);
});

test('development mode reuses the shared runtime when available', async () => {
  linkInstance.mode = 'development';
  const shared = { tag: 'shared' };
  registerShare({ vue: { name: 'vue', lib: () => shared } });

  let localCalls = 0;
  const result = await loadRuntime('vue', async () => {
    localCalls++;
    return { tag: 'local' };
  });

  expect(result).toBe(shared);
  expect(localCalls).toBe(0);
});

test('development mode falls back to local when nothing is shared', async () => {
  linkInstance.mode = 'development';

  const local = { tag: 'local' };
  const result = await loadRuntime('vue', async () => local);

  expect(result).toBe(local);
});

test('local loader result is cached per name', async () => {
  linkInstance.mode = 'production';
  let calls = 0;
  const loader = async () => ({ n: ++calls });

  const a = await loadRuntime('pinia', loader);
  const b = await loadRuntime('pinia', loader);

  expect(calls).toBe(1);
  expect(a).toBe(b);
});

test('production shares the first local runtime across callers (multi-remote)', async () => {
  linkInstance.mode = 'production';
  const a = { tag: 'A' };
  const b = { tag: 'B' };

  const r1 = await loadRuntime('vue', async () => a);
  const r2 = await loadRuntime('vue', async () => b);

  expect(r1).toBe(a);
  // 第二个子应用复用第一份 dev runtime，避免多份 __VUE_HMR_RUNTIME__
  expect(r2).toBe(a);
});

test('concurrent local loads are deduped', async () => {
  linkInstance.mode = 'production';
  let calls = 0;
  const loader = () =>
    new Promise((resolve) =>
      setTimeout(() => {
        calls++;
        resolve({ n: calls });
      }, 10),
    );

  const [x, y] = await Promise.all([loadRuntime('pinia', loader as any), loadRuntime('pinia', loader as any)]);
  expect(calls).toBe(1);
  expect(x).toBe(y);
});
