import { beforeEach, expect, test } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerPlugin } from '../src/plugins';
import { authPlugin } from '../src/plugins/auth';
import { rewriteRequestUrl } from '../src/loader/utils';

beforeEach(() => {
  linkInstance.plugins = [];
  linkInstance.requestRewriters = [];
});

test('injects token into resource URLs after beforeLoadRemote resolves it', async () => {
  registerPlugin(authPlugin({ token: 'T' }));
  await linkInstance.plugins[0].beforeLoadRemote({ name: 'remote' });

  expect(rewriteRequestUrl('http://host/app.js', 'remote')).toBe('http://host/app.js?token=T');
  // 其它远程不受影响
  expect(rewriteRequestUrl('http://host/app.js', 'other')).toBe('http://host/app.js');
});

test('supports an async per-remote token provider', async () => {
  registerPlugin(authPlugin({ tokens: { remote: async () => 'X' } }));
  await linkInstance.plugins[0].beforeLoadRemote({ name: 'remote' });

  expect(rewriteRequestUrl('http://host/app.js', 'remote')).toBe('http://host/app.js?token=X');
});

test('does not rewrite without a resolved token', () => {
  registerPlugin(authPlugin({ token: 'T' }));
  // 未经过 beforeLoadRemote，token 未缓存
  expect(rewriteRequestUrl('http://host/app.js', 'remote')).toBe('http://host/app.js');
});

test('honors origins filter', async () => {
  registerPlugin(authPlugin({ token: 'T', origins: ['https://cdn.example.com'] }));
  await linkInstance.plugins[0].beforeLoadRemote({ name: 'remote' });

  expect(rewriteRequestUrl('https://cdn.example.com/app.js', 'remote')).toBe(
    'https://cdn.example.com/app.js?token=T',
  );
  expect(rewriteRequestUrl('https://other.example.com/app.js', 'remote')).toBe('https://other.example.com/app.js');
});
