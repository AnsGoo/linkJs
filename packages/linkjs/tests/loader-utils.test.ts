import { beforeEach, describe, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { LIB_EXPOSE } from '../src/event-bus/constant';
import type { RemoteModule } from '../src/types';
import { resolveEntryConfig, useGetRemote, useHandleExpose } from '../src/loader/utils';

beforeEach(() => {
  linkInstance.eventBus.clear();
});

describe('resolveEntryConfig', () => {
  test('maps a string entry to both html and js', () => {
    expect(resolveEntryConfig('index.html')).toEqual({ html: 'index.html', js: 'index.html' });
  });

  test('passes through an object entry', () => {
    const entry = { html: 'index.html', js: '/mf/lib.js', shared: '/mf/shared.js' };
    expect(resolveEntryConfig(entry)).toBe(entry);
  });

  test('returns an empty object for undefined', () => {
    expect(resolveEntryConfig(undefined)).toEqual({});
  });
});

describe('useGetRemote (cache lookup)', () => {
  test('returns null on a cache miss', () => {
    const cache = new Map<string, RemoteModule>();
    expect(useGetRemote(cache)('missing')).toBeNull();
  });

  test('resolves the default export when no model is specified', () => {
    const cache = new Map<string, RemoteModule>([['app', { default: 'D', comp: 'C' }]]);
    expect(useGetRemote(cache)('app')).toBe('D');
  });

  test('resolves a named model from the cache', () => {
    const cache = new Map<string, RemoteModule>([['app', { default: 'D', comp: 'C' }]]);
    expect(useGetRemote(cache)('app/comp')).toBe('C');
  });

  test('falls back to the module itself when there is no default export', () => {
    const mod = { comp: 'C' } as RemoteModule;
    const cache = new Map<string, RemoteModule>([['app', mod]]);
    expect(useGetRemote(cache)('app')).toBe(mod);
  });
});

describe('useHandleExpose', () => {
  test('resolves and unsubscribes on a matching expose', () => {
    const cache = new Map<string, RemoteModule>();
    const resolve = vi.fn();
    const handler = useHandleExpose(cache, resolve, 'app', {});
    linkInstance.eventBus.on(LIB_EXPOSE, handler);

    linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'app', lib: { default: 'COMP' } });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(cache.get('app')).toEqual({ default: 'COMP' });

    // 命中后处理器应被移除：再次 expose 不再触发
    linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'app', lib: { default: 'COMP2' } });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(cache.get('app')).toEqual({ default: 'COMP' });
  });

  test('ignores exposes for other remotes', () => {
    const cache = new Map<string, RemoteModule>();
    const resolve = vi.fn();
    const handler = useHandleExpose(cache, resolve, 'app', {});
    linkInstance.eventBus.on(LIB_EXPOSE, handler);

    linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'other', lib: { default: 'X' } });
    expect(resolve).not.toHaveBeenCalled();
    expect(cache.has('app')).toBe(false);

    linkInstance.eventBus.off(LIB_EXPOSE, handler);
  });

  test('resolves the requested model when modelName is set', () => {
    const cache = new Map<string, RemoteModule>();
    const resolve = vi.fn();
    const handler = useHandleExpose(cache, resolve, 'app', { modelName: 'HelloWorld' });
    linkInstance.eventBus.on(LIB_EXPOSE, handler);

    linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'app', lib: { HelloWorld: 'HW' } });
    expect(resolve).toHaveBeenCalledWith('HW');
  });
});
