import { beforeEach, describe, expect, it } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { resolvePublicPath } from '../src/loader/utils';

beforeEach(() => {
  linkInstance.getPublicPath = undefined;
  (globalThis as any).location = { protocol: 'https:', host: 'host.app', href: 'https://host.app/page' };
});

describe('resolvePublicPath', () => {
  it('prefers the explicit host over any resolver/publicPath', async () => {
    const info = { name: 'r', entry: '', publicPath: 'https://cdn/x' };
    expect(await resolvePublicPath(info, 'r', 'https://explicit')).toBe('https://explicit');
  });

  it('uses the remote getPublicPath resolver when no explicit host', async () => {
    const info = { name: 'r', entry: '', getPublicPath: async (ctx: { appName: string }) => `https://cdn/${ctx.appName}` };
    expect(await resolvePublicPath(info, 'r')).toBe('https://cdn/r');
  });

  it('prefers remote getPublicPath over static publicPath', async () => {
    const info = {
      name: 'r',
      entry: '',
      publicPath: 'https://static/x',
      getPublicPath: () => 'https://dynamic/x',
    };
    expect(await resolvePublicPath(info, 'r')).toBe('https://dynamic/x');
  });

  it('falls back to remote static publicPath', async () => {
    expect(await resolvePublicPath({ name: 'r', entry: '', publicPath: 'https://cdn/x' }, 'r')).toBe('https://cdn/x');
  });

  it('falls back to the instance getPublicPath when the remote has none', async () => {
    linkInstance.getPublicPath = (ctx) => `https://global/${ctx.appName}`;
    expect(await resolvePublicPath({ name: 'r', entry: '' }, 'r')).toBe('https://global/r');
  });

  it('falls back to the registered host', async () => {
    expect(await resolvePublicPath({ name: 'r', entry: '', host: 'http://localhost:4001' }, 'r')).toBe(
      'http://localhost:4001',
    );
  });

  it('resolves a relative publicPath against the current page', async () => {
    expect(await resolvePublicPath({ name: 'r', entry: '', publicPath: '/cdn/' }, 'r')).toBe('https://host.app/cdn/');
  });

  it('defaults to the current page origin', async () => {
    expect(await resolvePublicPath({ name: 'r', entry: '' }, 'r')).toBe('https://host.app');
  });
});
