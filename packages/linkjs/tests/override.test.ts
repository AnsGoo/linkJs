import { expect, test, beforeEach, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { overrideRemote } from '../src/override';
import { __LINKJS_OVERRIDES__ } from '../src/constant';

beforeEach(() => {
  linkInstance.remotes.clear();
  vi.restoreAllMocks();
});

test('skips invalid hosts and only loads the valid override', async () => {
  linkInstance.remotes.set('remote', { name: 'remote', entry: 'x', status: 'unloaded' } as any);

  const store: Record<string, string> = {
    [__LINKJS_OVERRIDES__]: JSON.stringify({
      remote: 'https://cdn.example.com',
      badProtocol: 'ftp://example.com',
      relative: '/relative',
      notString: 123,
    }),
  };
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: () => {},
    removeItem: () => {},
  } as any;

  const fetchMock = vi.fn(async () => ({
    ok: true,
    statusText: 'OK',
    json: async () => ({ version: '1.2.3', shared: {}, entry: { js: '/lib.js' } }),
  }));
  globalThis.fetch = fetchMock as any;

  await overrideRemote();

  const calledUrls = fetchMock.mock.calls.map((call) => call[0]);
  expect(calledUrls).toEqual(['https://cdn.example.com/manifest.json']);

  const remote = linkInstance.remotes.get('remote') as any;
  expect(remote.version).toBe('1.2.3');
  expect(remote.host).toBe('https://cdn.example.com');
  expect(remote.entry).toEqual({ js: '/lib.js' });
});

test('does nothing when storage is empty', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} } as any;
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock as any;

  await overrideRemote();
  expect(fetchMock).not.toHaveBeenCalled();
});
