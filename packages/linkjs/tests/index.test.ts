import { expect, test, vi, beforeEach } from 'vitest';
import { getInstance, expose, getRemote, loadLib, loadRemote } from '../src';
import { LIB_EXPOSE } from '../src/event-bus/constant';

// 模拟 DOM API
globalThis.DOMParser = class {
  parseFromString(_html: string, _type: string) {
    return {
      querySelectorAll: (selector: string) => {
        if (selector === 'link[rel="stylesheet"]') {
          return [];
        } else if (selector === 'script[src]') {
          return [];
        }
        return [];
      },
    };
  }
};

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve('<html><body></body></html>'),
  }),
);

globalThis.document = {
  head: {
    appendChild: vi.fn(),
  },
};

globalThis.window = globalThis;

beforeEach(() => {
  vi.clearAllMocks();
});

test('getInstance should return the linkjs instance', () => {
  const instance = getInstance();
  expect(instance).toBeDefined();
  expect(instance.name).toBe('linkjs');
  expect(instance.version).toBe('1.0.0');
  expect(instance.eventBus).toBeDefined();
  expect(instance.apps).toBeInstanceOf(Map);
  expect(instance.libs).toBeInstanceOf(Map);
});

test('typed remote APIs exist and getRemote returns null for uncached entries', () => {
  expect(typeof getRemote).toBe('function');
  expect(typeof loadLib).toBe('function');
  expect(typeof loadRemote).toBe('function');
  // `LinkjsRemoteTypes` 为空时回落到通用签名；未缓存返回 null。
  expect(getRemote('missing/Entry')).toBeNull();
});

test('expose should emit LIB_EXPOSE event', () => {
  const instance = getInstance();
  const mockLib = { name: 'test-lib', version: '1.0.0' };
  const mockOptions = { foo: 'bar' };

  let emittedData: any = null;
  instance.eventBus.on(LIB_EXPOSE, (data: any) => {
    emittedData = data;
  });

  expose('test-lib', mockLib, mockOptions);

  expect(emittedData).toBeDefined();
  expect(emittedData.libName).toBe('test-lib');
  expect(emittedData.lib).toBe(mockLib);
  expect(emittedData.options).toBe(mockOptions);
});
