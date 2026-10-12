import { beforeEach, expect, test, vi } from 'vitest';
import { preloadRemote, clearPrefetchCache } from '../src/preload';
import { createInstance } from '../src';
import { linkInstance } from '../src/state/instance';
import { LOAD_STATUS } from '../src/event-bus/constant';

interface FakeLink {
  tagName: string;
  rel: string;
  href: string;
  as?: string;
  crossOrigin?: string;
  dataset: Record<string, string>;
}

let created: FakeLink[];

beforeEach(() => {
  created = [];
  linkInstance.remotes.clear();
  clearPrefetchCache();
  (globalThis as any).location = { href: 'http://localhost:5173/', origin: 'http://localhost:5173' };
  (globalThis as any).document = {
    head: { appendChild: (el: FakeLink) => created.push(el) },
    querySelector: () => null,
    createElement: (): FakeLink => ({ tagName: 'link', rel: '', href: '', dataset: {} }),
  };
});

test('preloads entry sync JS/CSS from the manifest', async () => {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      name: 'remote-lib',
      entry: {
        assets: {
          js: { sync: ['/mf/lib.js'], async: ['/mf/lazy.js'] },
          css: { sync: ['/mf/style.css'], async: [] },
        },
      },
      exposes: [],
    }),
  }));

  const manifest = await preloadRemote({ manifestUrl: 'http://localhost:4001/manifest.json', name: 'remote-lib' });
  expect(manifest.name).toBe('remote-lib');

  const byHref = new Map(created.map((l) => [l.href, l]));
  const lib = byHref.get('http://localhost:4001/mf/lib.js');
  expect(lib?.rel).toBe('modulepreload');
  const css = byHref.get('http://localhost:4001/mf/style.css');
  expect(css?.rel).toBe('preload');
  expect(css?.as).toBe('style');
  // 默认不预取异步资源
  expect(byHref.has('http://localhost:4001/mf/lazy.js')).toBe(false);
});

test('prefetch=true includes async assets and exposes', async () => {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      entry: { assets: { js: { sync: ['/a.js'], async: ['/b.js'] } } },
      exposes: [{ name: 'X', path: '/x.js', assets: { js: { sync: ['/x.js'] } } }],
    }),
  }));

  await preloadRemote({ manifestUrl: 'http://localhost:4001/manifest.json', prefetch: true });
  const hrefs = created.map((l) => l.href);
  expect(hrefs).toContain('http://localhost:4001/a.js');
  expect(hrefs).toContain('http://localhost:4001/b.js');
  expect(hrefs).toContain('http://localhost:4001/x.js');
  expect(created.find((l) => l.href === 'http://localhost:4001/b.js')?.rel).toBe('prefetch');
});

test('applies declared shareScope from the manifest onto the registered remote', async () => {
  linkInstance.remotes.set('remoteApp', { name: 'remoteApp', entry: '/', status: 'unloaded' });
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ name: 'RemoteApp', shareScope: ['ui', 'global'], publicPath: 'https://cdn.example.com/remote/' }),
  }));

  await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

  const remote = linkInstance.remotes.get('remoteApp');
  expect(remote?.displayName).toBe('RemoteApp');
  expect(remote?.shareScope).toEqual(['ui', 'global']);
  expect(remote?.publicPath).toBe('https://cdn.example.com/remote/');
});

test('skips the network when already prefetched (snapshot)', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ name: 'RemoteApp', entry: { assets: { js: { sync: ['/a.js'] } } } }),
  }));
  (globalThis as any).fetch = fetchMock;

  await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });
  const second = await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(second.name).toBe('RemoteApp');
});

test('skips everything when the remote is already loaded', async () => {
  linkInstance.remotes.set('remoteApp', { name: 'remoteApp', entry: '/', status: LOAD_STATUS.LOADED });
  const fetchMock = vi.fn();
  (globalThis as any).fetch = fetchMock;

  const manifest = await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(manifest.name).toBe('remoteApp');
});

test('force refreshes even when already prefetched', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ name: 'RemoteApp', entry: { assets: { js: { sync: ['/a.js'] } } } }),
  }));
  (globalThis as any).fetch = fetchMock;

  await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });
  await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp', force: true });

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('throws when manifest fetch fails', async () => {
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 404 }));
  await expect(preloadRemote({ manifestUrl: 'http://localhost:4001/manifest.json' })).rejects.toThrow(/failed to fetch manifest/);
});

test('applies SRI integrity from the manifest', async () => {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      entry: { assets: { js: { sync: ['/mf/lib.js'] }, css: { sync: ['/mf/style.css'] } } },
      integrity: { '/mf/lib.js': 'sha384-AAA', '/mf/style.css': 'sha384-BBB' },
    }),
  }));

  await preloadRemote({ manifestUrl: 'http://localhost:4001/mf/manifest.json' });

  const byHref = new Map(created.map((l) => [l.href, l]));
  expect((byHref.get('http://localhost:4001/mf/lib.js') as any)?.integrity).toBe('sha384-AAA');
  expect((byHref.get('http://localhost:4001/mf/style.css') as any)?.integrity).toBe('sha384-BBB');
});

test('createInstance auto-runs build-time injected preloads (__linkjs_preload__)', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      name: 'remoteApp',
      version: '1.0.0',
      entry: { assets: { js: { sync: ['/mf/lib.js'] } } },
      exposes: [],
    }),
  }));
  (globalThis as any).fetch = fetchMock;
  (globalThis as any).__linkjs_preload__ = [
    { name: 'remoteApp', manifestUrl: 'http://localhost:8081/manifest.json', prefetch: true },
  ];

  createInstance({});

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  // 只消费一次
  expect((globalThis as any).__linkjs_preload__).toBeUndefined();
  await vi.waitFor(() => expect(created.some((l) => l.href.includes('/mf/lib.js'))).toBe(true));
});
