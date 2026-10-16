import { describe, expect, it } from 'vitest';
import { buildRuntimeBootstrap, selectRemoteImportNames } from '../src/runtime-bootstrap';

describe('buildRuntimeBootstrap', () => {
  it('derives hosts from host override or manifestUrl origin', () => {
    const { hosts, preloads } = buildRuntimeBootstrap([
      { name: 'remoteApp', manifestUrl: 'http://localhost:4002/mf/manifest.json', host: 'http://localhost:8081' },
      { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json' },
    ]);
    expect(hosts).toEqual({ remoteApp: 'http://localhost:8081', 'remote-lib': 'http://localhost:4001' });
    expect(preloads).toEqual([]);
  });

  it('emits preload entries only for remotes that opt in', () => {
    const { preloads } = buildRuntimeBootstrap([
      { name: 'remoteApp', manifestUrl: 'http://localhost:4002/mf/manifest.json', host: 'http://localhost:8081' },
      { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json', preload: { prefetch: true } },
    ]);
    expect(preloads).toEqual([
      {
        name: 'remote-lib',
        manifestUrl: 'http://localhost:4001/mf/manifest.json',
        host: 'http://localhost:4001',
        prefetch: true,
      },
    ]);
  });

  it('lets preload override manifestUrl / host / prefetch', () => {
    const { preloads } = buildRuntimeBootstrap([
      {
        name: 'remoteApp',
        manifestUrl: 'http://localhost:4002/mf/manifest.json',
        host: 'http://localhost:8081',
        preload: { manifestUrl: 'http://localhost:8081/manifest.json' },
      },
    ]);
    expect(preloads).toEqual([{ name: 'remoteApp', manifestUrl: 'http://localhost:8081/manifest.json', host: 'http://localhost:8081' }]);
  });

  it('treats preload: true as defaults (no prefetch key)', () => {
    const { preloads } = buildRuntimeBootstrap([{ name: 'r', manifestUrl: 'http://cdn/r/manifest.json', preload: true }]);
    expect(preloads).toEqual([{ name: 'r', manifestUrl: 'http://cdn/r/manifest.json', host: 'http://cdn' }]);
  });
});

describe('selectRemoteImportNames', () => {
  it('only returns remotes that opted into preload (lazy ones excluded)', () => {
    expect(
      selectRemoteImportNames([
        { name: 'eager', manifestUrl: 'http://cdn/eager/manifest.json', preload: true },
        { name: 'lazy', manifestUrl: 'http://cdn/lazy/manifest.json' },
        { name: 'eager2', manifestUrl: 'http://cdn/e2/manifest.json', preload: { prefetch: true } },
      ]),
    ).toEqual(['eager', 'eager2']);
  });
});
