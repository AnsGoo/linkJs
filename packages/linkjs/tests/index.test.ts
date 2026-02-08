import { expect, test, vi, beforeEach } from 'vitest';
import { getLinkInstance, exposeLib } from '../src';
import { LIB_EXPOSE } from '../src/event-bus/constant';

// 模拟 DOM API
globalThis.DOMParser = class {
  parseFromString(html: string, type: string) {
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

beforeEach(() => {
  vi.clearAllMocks();
});

test('getLinkInstance should return the linkjs instance', () => {
  const instance = getLinkInstance();
  expect(instance).toBeDefined();
  expect(instance.name).toBe('linkjs');
  expect(instance.version).toBe('1.0.0');
  expect(instance.eventBus).toBeDefined();
  expect(instance.apps).toBeInstanceOf(Map);
  expect(instance.libs).toBeInstanceOf(Map);
});

test('exposeLib should emit LIB_EXPOSE event', () => {
  const instance = getLinkInstance();
  const mockLib = { name: 'test-lib', version: '1.0.0' };
  const mockOptions = { foo: 'bar' };

  let emittedData: any = null;
  instance.eventBus.on(LIB_EXPOSE, (data: any) => {
    emittedData = data;
  });

  exposeLib('test-lib', mockLib, mockOptions);

  expect(emittedData).toBeDefined();
  expect(emittedData.libName).toBe('test-lib');
  expect(emittedData.lib).toBe(mockLib);
  expect(emittedData.options).toBe(mockOptions);
});

test('linkInstance should have app management methods', () => {
  const instance = getLinkInstance();

  expect(typeof instance.registerApp).toBe('function');
  expect(typeof instance.unregisterApp).toBe('function');
  expect(typeof instance.getApp).toBe('function');

  const mockApp = { name: 'test-app' };
  instance.registerApp('test-app', mockApp);
  expect(instance.getApp('test-app')).toBe(mockApp);

  instance.unregisterApp('test-app');
  expect(instance.getApp('test-app')).toBeUndefined();
});

test('linkInstance should have lib management methods', () => {
  const instance = getLinkInstance();

  expect(typeof instance.registerLib).toBe('function');
  expect(typeof instance.unregisterLib).toBe('function');
  expect(typeof instance.getLib).toBe('function');

  const mockLib = { name: 'test-lib' };
  instance.registerLib('test-lib', mockLib);
  expect(instance.getLib('test-lib')).toBe(mockLib);

  instance.unregisterLib('test-lib');
  expect(instance.getLib('test-lib')).toBeUndefined();
});

test('linkInstance should have init and destroy methods', () => {
  const instance = getLinkInstance();

  expect(typeof instance.init).toBe('function');
  expect(typeof instance.destroy).toBe('function');

  // 测试不会抛出异常
  expect(() => instance.init()).not.toThrow();
  expect(() => instance.destroy()).not.toThrow();
});
