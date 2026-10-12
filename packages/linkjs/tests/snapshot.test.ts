import { beforeEach, describe, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { LOAD_STATUS } from '../src/event-bus/constant';
import { preloadRemote, clearPrefetchCache } from '../src/preload';
import { globalSnapshot, remoteSnapshot } from '../src/snapshot';

function mockManifest() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      name: 'RemoteApp',
      entry: { assets: { js: { sync: ['/a.js'] }, css: { sync: ['/s.css'] } } },
    }),
  }));
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  linkInstance.remotes.clear();
  clearPrefetchCache();
  (globalThis as any).location = { href: 'http://localhost:5173/', origin: 'http://localhost:5173' };
  (globalThis as any).document = {
    head: { appendChild: () => {} },
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
  };
});

describe('remoteSnapshot / globalSnapshot', () => {
  test('remoteSnapshot returns undefined for an unknown remote', () => {
    expect(remoteSnapshot('nope')).toBeUndefined();
  });

  test('reflects the prefetched manifest and assets', async () => {
    mockManifest();
    await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

    const snap = remoteSnapshot('remoteApp');
    expect(snap?.prefetched).toBe(true);
    expect(snap?.manifestUrl).toBe('http://localhost:8081/manifest.json');
    expect(snap?.assets).toEqual(['http://localhost:8081/a.js', 'http://localhost:8081/s.css']);
    // 仅预取、尚未加载
    expect(snap?.status).toBe('unloaded');
  });

  test('reflects loaded status from the registry (and skips the fetch)', async () => {
    const fetchMock = mockManifest();
    linkInstance.remotes.set('remoteApp', {
      name: 'remoteApp',
      entry: '/',
      status: LOAD_STATUS.LOADED,
      displayName: 'RemoteApp',
    });

    await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(remoteSnapshot('remoteApp')?.status).toBe('loaded');
  });

  test('globalSnapshot includes registered and prefetched remotes with a version', async () => {
    mockManifest();
    linkInstance.remotes.set('other', { name: 'other', entry: '/', status: LOAD_STATUS.UNLOADED });
    await preloadRemote({ manifestUrl: 'http://localhost:8081/manifest.json', name: 'remoteApp' });

    const snap = globalSnapshot();
    expect(Object.keys(snap.remotes).sort()).toEqual(['other', 'remoteApp']);
    expect(snap.remotes.other.status).toBe('unloaded');
    expect(snap.remotes.remoteApp.prefetched).toBe(true);
    expect(snap.version).toBeGreaterThan(0);
  });
});
