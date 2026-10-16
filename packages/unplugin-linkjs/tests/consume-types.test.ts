import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { consumeRemoteTypes } from '../src/consume-types';

const DTS = 'export declare const HelloWorld: number;\n';

function manifestFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes('manifest.json')) {
      return {
        ok: true,
        json: async () => ({
          name: 'remoteApp',
          mode: 'production',
          metaData: { types: '/mf/lib.d.ts', typesHash: 'sha384-abc' },
          expose: ['HelloWorld'],
        }),
      };
    }
    return { ok: true, text: async () => DTS };
  }) as unknown as typeof fetch;
}

function withTempOutDir(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'linkjs-types-'));
  return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

describe('consumeRemoteTypes', () => {
  it('fetches manifest + d.ts, caches it and writes the aggregate declarations', async () => {
    await withTempOutDir(async (root) => {
      const fetchImpl = manifestFetch();
      const result = await consumeRemoteTypes(
        { remotes: [{ name: 'remoteApp', manifestUrl: 'http://cdn/manifest.json' }], fetch: fetchImpl },
        root,
      );

      expect(result.remotes).toHaveLength(1);
      const info = result.remotes[0];
      expect(info.name).toBe('remoteApp');
      expect(info.typesHash).toBe('sha384-abc');
      expect(info.mode).toBe('production');
      expect(info.exposes).toEqual(['HelloWorld']);

      const cached = join(root, 'node_modules/.linkjs', info.cacheRel);
      expect(existsSync(cached)).toBe(true);
      expect(readFileSync(cached, 'utf-8')).toBe(DTS);

      const aggregate = readFileSync(result.file, 'utf-8');
      expect(aggregate).toContain('declare module "remoteApp"');
      expect(aggregate).toContain('declare module "remoteApp/HelloWorld"');
      expect(aggregate).toContain('interface LinkjsRemoteTypes');
      expect(aggregate).toContain('typeof import("remoteApp")["HelloWorld"]');
    });
  });

  it('derives host from the manifest directory (not origin) when host is omitted', async () => {
    await withTempOutDir(async (root) => {
      const result = await consumeRemoteTypes(
        { remotes: [{ name: 'remoteLib', manifestUrl: 'http://cdn/mf/manifest.json' }], fetch: manifestFetch() },
        root,
      );
      expect(result.remotes[0].host).toBe('http://cdn/mf/');
    });
  });

  it('skips remotes without a declared types path', async () => {
    await withTempOutDir(async (root) => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: async () => ({ name: 'no-types', mode: 'production' }),
      })) as unknown as typeof fetch;

      const result = await consumeRemoteTypes(
        { remotes: [{ name: 'noTypes', manifestUrl: 'http://cdn/manifest.json' }], fetch: fetchImpl },
        root,
      );
      expect(result.remotes).toHaveLength(0);
      expect(readFileSync(result.file, 'utf-8')).toContain('interface LinkjsRemoteTypes');
    });
  });

  it('keeps going (warn) when a remote fails, still writing the aggregate', async () => {
    await withTempOutDir(async (root) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;

      const result = await consumeRemoteTypes(
        { remotes: [{ name: 'down', manifestUrl: 'http://cdn/manifest.json' }], fetch: fetchImpl },
        root,
      );

      expect(result.remotes).toHaveLength(0);
      expect(existsSync(result.file)).toBe(true);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('applies the auth token to manifest and d.ts requests', async () => {
    await withTempOutDir(async (root) => {
      const fetchImpl = manifestFetch();
      await consumeRemoteTypes(
        {
          remotes: [{ name: 'remoteApp', manifestUrl: 'http://cdn/manifest.json' }],
          auth: { token: 'T', queryParam: 'access_token' },
          fetch: fetchImpl,
        },
        root,
      );
      const urls = (fetchImpl as any).mock.calls.map((call: unknown[]) => String(call[0]));
      expect(urls.every((url: string) => url.includes('access_token=T'))).toBe(true);
    });
  });

  it('throws when a remote target has neither manifestUrl nor host', async () => {
    await withTempOutDir(async (root) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await consumeRemoteTypes({ remotes: [{ name: 'bad' }] }, root);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
      expect(existsSync(join(root, 'linkjs-remotes.d.ts'))).toBe(true);
    });
  });
});
