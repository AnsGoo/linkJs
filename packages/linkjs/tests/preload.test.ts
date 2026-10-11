import { beforeEach, expect, test, vi } from 'vitest';
import { preloadRemote } from '../src/preload';

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
