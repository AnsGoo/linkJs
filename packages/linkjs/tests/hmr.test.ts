import { expect, test, afterEach } from 'vitest';
import { linkInstance } from '../src/state/instance';
import {
  installVueHmrRuntimeShim,
  indexExposedLib,
  applyComponentUpdate,
  clearAppHmr,
  subscribeRemoteUpdate,
} from '../src/hmr';

afterEach(() => {
  delete (globalThis as any).__VUE_HMR_RUNTIME__;
  clearAppHmr();
});

test('installVueHmrRuntimeShim installs only when real runtime is absent', () => {
  expect(installVueHmrRuntimeShim()).toBe(true);
  expect((globalThis as any).__VUE_HMR_RUNTIME__).toBeTruthy();

  // 已有 runtime（宿主 DEV 场景）时不覆盖
  expect(installVueHmrRuntimeShim()).toBe(false);
});

test('shim.reload replaces exposed slot and broadcasts REMOTE_UPDATE', () => {
  installVueHmrRuntimeShim();
  const lib: Record<string, any> = { HelloWorld: { __hmrId: 'abc', version: 1 } };
  indexExposedLib('remote', lib);

  const updates: string[] = [];
  const off = subscribeRemoteUpdate('remote/HelloWorld', (p) => updates.push(`${p.appName}:${p.key}`));

  (globalThis as any).__VUE_HMR_RUNTIME__.reload('abc', { __hmrId: 'abc', version: 2 });

  expect(lib.HelloWorld.version).toBe(2);
  expect(updates).toEqual(['remote:HelloWorld']);

  off();
  (globalThis as any).__VUE_HMR_RUNTIME__.reload('abc', { __hmrId: 'abc', version: 3 });
  expect(lib.HelloWorld.version).toBe(3);
  expect(updates).toEqual(['remote:HelloWorld']); // 已取消订阅
});

test('shim.rerender merges new render into a fresh component object', () => {
  installVueHmrRuntimeShim();
  const current = { __hmrId: 'xyz', setup: () => {} };
  const lib: Record<string, any> = { Comp: current };
  indexExposedLib('remote', lib);

  const render = () => 'new';
  (globalThis as any).__VUE_HMR_RUNTIME__.rerender('xyz', render);

  expect(lib.Comp).not.toBe(current);
  expect(lib.Comp.render).toBe(render);
  expect(lib.Comp.setup).toBe(current.setup);
});

test('applyComponentUpdate returns false for unknown hmrId and after clear', () => {
  const lib: Record<string, any> = { Comp: { __hmrId: 'id1' } };
  indexExposedLib('remote', lib);

  expect(applyComponentUpdate('missing', () => null)).toBe(false);
  expect(applyComponentUpdate('id1', () => ({ __hmrId: 'id1', v: 2 }))).toBe(true);

  clearAppHmr('remote');
  expect(applyComponentUpdate('id1', () => ({ __hmrId: 'id1', v: 3 }))).toBe(false);
});

test('subscribeRemoteUpdate filters by appName', () => {
  const seen: string[] = [];
  const off = subscribeRemoteUpdate('remote/A', () => seen.push('remote'));

  linkInstance.eventBus.emit('remoteUpdate', { appName: 'other' });
  linkInstance.eventBus.emit('remoteUpdate', { appName: 'remote' });
  expect(seen).toEqual(['remote']);
  off();
});
