import { beforeEach, describe, expect, test, vi } from 'vitest';
import { checkRemoteHealth, clearHealthCache, selectRemoteSource } from '../src/loader/source';

function base(overrides: Record<string, unknown> = {}) {
  return { name: 'r', entry: '', ...overrides } as any;
}

beforeEach(() => {
  clearHealthCache();
  vi.restoreAllMocks();
});

describe('selectRemoteSource', () => {
  test('returns undefined when no sources are declared', async () => {
    expect(await selectRemoteSource(base(), 'r')).toBeUndefined();
  });

  test('first-healthy picks the first healthy source', async () => {
    (globalThis as any).fetch = vi.fn(async (url: string) => ({ ok: !String(url).includes('a.example') }));

    const info = base({
      sources: [{ host: 'http://a.example' }, { host: 'http://b.example' }],
      healthCheck: { interval: 0 },
    });
    expect(await selectRemoteSource(info, 'r')).toEqual({ host: 'http://b.example' });
  });

  test('falls back to the first source when none are healthy', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false }));

    const info = base({
      sources: [{ host: 'http://a.example' }, { host: 'http://b.example' }],
      healthCheck: { interval: 0 },
    });
    expect(await selectRemoteSource(info, 'r')).toEqual({ host: 'http://a.example' });
  });

  test('weighted distributes picks by weight', async () => {
    const info = base({
      sourceStrategy: 'weighted',
      sources: [
        { host: 'http://a.example', weight: 1 },
        { host: 'http://b.example', weight: 3 },
      ],
    });

    expect((await selectRemoteSource(info, 'r', { skipHealthCheck: true, random: () => 0 }))?.host).toBe('http://a.example');
    expect((await selectRemoteSource(info, 'r', { skipHealthCheck: true, random: () => 0.99 }))?.host).toBe('http://b.example');
  });

  test('weighted falls back to all sources when none are healthy', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false }));

    const info = base({
      sourceStrategy: 'weighted',
      sources: [
        { host: 'http://a.example', weight: 1 },
        { host: 'http://b.example', weight: 1 },
      ],
      healthCheck: { interval: 0 },
    });
    expect((await selectRemoteSource(info, 'r', { random: () => 0.99 }))?.host).toBe('http://b.example');
  });

  test('reuses cached health results within the interval', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    (globalThis as any).fetch = fetchMock;

    const info = base({ sources: [{ host: 'http://a.example' }], healthCheck: { interval: 10000 } });
    await selectRemoteSource(info, 'r');
    await selectRemoteSource(info, 'r');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('checkRemoteHealth', () => {
  test('probes {base}/{healthCheck.path} and reports ok', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    (globalThis as any).fetch = fetchMock;

    await expect(checkRemoteHealth({ host: 'http://a.example' }, { path: 'health', interval: 0 }, 'r')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://a.example/health', expect.anything());
  });

  test('returns false when the probe throws (network error)', async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(checkRemoteHealth({ host: 'http://a.example' }, { interval: 0 }, 'r')).resolves.toBe(false);
  });

  test('returns false when the source has no host/publicPath', async () => {
    await expect(checkRemoteHealth({}, { interval: 0 }, 'r')).resolves.toBe(false);
  });
});
