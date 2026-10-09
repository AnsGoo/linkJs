import { expect, test, beforeEach, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { loadApp, clearRemoteCache, unloadRemote } from '../src/loader';
import { LIB_EXPOSE } from '../src/event-bus/constant';

interface FakeElement {
  tagName: string;
  rel: string;
  href: string;
  src: string;
  type: string;
  dataset: Record<string, string>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  getAttribute(name: string): string | null;
}

function createElement(tag: string): FakeElement {
  return {
    tagName: tag,
    rel: '',
    href: '',
    src: '',
    type: '',
    dataset: {},
    onload: null,
    onerror: null,
    getAttribute(name: string) {
      return (this as any)[name] ?? null;
    },
  };
}

beforeEach(() => {
  linkInstance.remotes.clear();
  linkInstance.shares.clear();
  linkInstance.sharedMap.clear();
  clearRemoteCache();
  vi.restoreAllMocks();
});

test('loadApp injects stylesheet/script and resolves on expose', async () => {
  const created: FakeElement[] = [];

  const htmlAnchor = (href: string) => ({
    getAttribute: (name: string) => (name === 'href' ? href : null),
  });
  const htmlScript = (src: string) => ({
    getAttribute: (name: string) => (name === 'src' ? src : null),
  });

  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll: (selector: string) => {
          if (selector.includes('stylesheet')) return [htmlAnchor('/style.css')];
          if (selector.includes('modulepreload')) return [htmlAnchor('/chunk.js')];
          return [htmlScript('/main.js')];
        },
      };
    }
  } as any;

  globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html></html>' })) as any;

  globalThis.document = {
    head: {
      appendChild: (el: FakeElement) => {
        created.push(el);
        el.onload?.();
      },
    },
    body: {
      appendChild: (el: FakeElement) => {
        created.push(el);
        queueMicrotask(() => el.onload?.());
      },
    },
    querySelector: () => null,
    createElement: (tag: string) => createElement(tag),
  } as any;

  const promise = loadApp('remote', { host: 'http://localhost:8081' });

  // 等待 fetch/preload 完成、listener 注册
  await new Promise((r) => setTimeout(r, 30));
  linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'remote', lib: { default: 'COMP' } });

  const result = await promise;
  expect(result).toBe('COMP');

  const css = created.find((el) => el.tagName === 'link' && el.rel === 'stylesheet');
  expect(css?.href).toBe('http://localhost:8081/style.css');

  const preload = created.find((el) => el.tagName === 'link' && el.rel === 'modulepreload');
  expect(preload?.href).toBe('http://localhost:8081/chunk.js');

  const script = created.find((el) => el.tagName === 'script');
  expect(script?.src).toBe('http://localhost:8081/main.js');
});

test('loadApp with sandbox reverts globals on unloadRemote', async () => {
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll: (selector: string) =>
          selector === 'script[src]' ? [{ getAttribute: (n: string) => (n === 'src' ? '/main.js' : null) }] : [],
      };
    }
  } as any;
  globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html></html>' })) as any;
  globalThis.document = {
    head: { appendChild: () => {} },
    body: { appendChild: (el: FakeElement) => queueMicrotask(() => el.onload?.()) },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag: string) => createElement(tag),
  } as any;

  const promise = loadApp('remote', { host: 'http://localhost:8081', sandbox: true });
  await new Promise((r) => setTimeout(r, 30));
  linkInstance.eventBus.emit(LIB_EXPOSE, { libName: 'remote', lib: { default: 'COMP' } });
  await promise;

  (globalThis as any).__remote_pollutes__ = 1;
  unloadRemote('remote');
  expect('__remote_pollutes__' in globalThis).toBe(false);
});

test('loadApp rejects when script fails and ignoreScriptError is false', async () => {
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll: (selector: string) =>
          selector.includes('script') || selector === 'script[src]'
            ? [{ getAttribute: (n: string) => (n === 'src' ? '/broken.js' : null) }]
            : [],
      };
    }
  } as any;
  globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html></html>' })) as any;
  globalThis.document = {
    head: { appendChild: () => {} },
    body: {
      appendChild: (el: FakeElement) => queueMicrotask(() => el.onerror?.()),
    },
    querySelector: () => null,
    createElement: (tag: string) => createElement(tag),
  } as any;

  await expect(loadApp('remote', { host: 'http://localhost:8081', timeout: 500 })).rejects.toThrow(/Failed to load script/);
});
