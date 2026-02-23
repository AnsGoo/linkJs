import { describe, expect, test, beforeEach } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { registerShare, loadShare, getShare } from '../src/share';

describe('Share Strategy', () => {
  beforeEach(() => {
    linkInstance.shares.clear();
    linkInstance.sharedMap.clear();
  });

  describe('version-first strategy', () => {
    beforeEach(() => {
      linkInstance.shareStrategy = 'version-first';
    });

    test('loadShare should return loaded module when no version specified', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module1 = await loadShare('lodash');
      expect(module1).toEqual({ name: 'lodash-4.17.21' });

      const module2 = await loadShare('lodash');
      expect(module2).toEqual({ name: 'lodash-4.17.21' });
      expect(module2).toBe(module1);
    });

    test('loadShare should load latest version when no version specified and no loaded version', async () => {
      const shares: Record<string, any> = {};
      shares['lodash'] = {
        version: '4.17.20',
        lib: { name: 'lodash-4.17.20' },
      };
      shares['lodash'] = {
        version: '4.17.21',
        lib: { name: 'lodash-4.17.21' },
      };

      registerShare(shares);

      const module = await loadShare('lodash');
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should return loaded module when version matches loaded version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash', { version: '4.17.21' });

      const module = await loadShare('lodash', { version: '4.17.21' });
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should load new version when version does not match loaded version', async () => {
      const shares: Record<string, any> = {};
      shares['lodash'] = {
        version: '4.17.20',
        lib: { name: 'lodash-4.17.20' },
      };
      shares['lodash'] = {
        version: '4.17.21',
        lib: { name: 'lodash-4.17.21' },
      };

      registerShare(shares);

      await loadShare('lodash', { version: '4.17.20' });

      const module = await loadShare('lodash', { version: '4.17.21' });
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should return null when version does not match any available version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module = await loadShare('lodash', { version: '5.0.0' });
      expect(module).toBeNull();
    });

    test('getShare should return null when no version specified and no loaded version', () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module = getShare('lodash');
      expect(module).toBeNull();
    });

    test('getShare should return loaded module when no version specified', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash');

      const module = getShare('lodash');
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('getShare should return null when version does not match loaded version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash', { version: '4.17.21' });

      const module = getShare('lodash', { version: '5.0.0' });
      expect(module).toBeNull();
    });
  });

  describe('loaded-first strategy', () => {
    beforeEach(() => {
      linkInstance.shareStrategy = 'loaded-first';
    });

    test('loadShare should return loaded module when no version specified', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module1 = await loadShare('lodash');
      expect(module1).toEqual({ name: 'lodash-4.17.21' });

      const module2 = await loadShare('lodash');
      expect(module2).toEqual({ name: 'lodash-4.17.21' });
      expect(module2).toBe(module1);
    });

    test('loadShare should load latest version when no version specified and no loaded version', async () => {
      const shares: Record<string, any> = {};
      shares['lodash'] = {
        version: '4.17.20',
        lib: { name: 'lodash-4.17.20' },
      };
      shares['lodash'] = {
        version: '4.17.21',
        lib: { name: 'lodash-4.17.21' },
      };

      registerShare(shares);

      const module = await loadShare('lodash');
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should return loaded module when version matches loaded version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash', { version: '4.17.21' });

      const module = await loadShare('lodash', { version: '4.17.21' });
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should load new version when version does not match loaded version', async () => {
      const shares: Record<string, any> = {};
      shares['lodash'] = {
        version: '4.17.20',
        lib: { name: 'lodash-4.17.20' },
      };
      shares['lodash'] = {
        version: '4.17.21',
        lib: { name: 'lodash-4.17.21' },
      };

      registerShare(shares);

      await loadShare('lodash', { version: '4.17.20' });

      const module = await loadShare('lodash', { version: '4.17.21' });
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('loadShare should return null when version does not match any available version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module = await loadShare('lodash', { version: '5.0.0' });
      expect(module).toBeNull();
    });

    test('getShare should return null when no version specified and no loaded version', () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      const module = getShare('lodash');
      expect(module).toBeNull();
    });

    test('getShare should return loaded module when no version specified', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash');

      const module = getShare('lodash');
      expect(module).toEqual({ name: 'lodash-4.17.21' });
    });

    test('getShare should return null when version does not match loaded version', async () => {
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-4.17.21' },
        },
      });

      await loadShare('lodash', { version: '4.17.21' });

      const module = getShare('lodash', { version: '5.0.0' });
      expect(module).toBeNull();
    });
  });

  describe('scope isolation', () => {
    test('modules in different scopes should not interfere with each other', async () => {
      linkInstance.shareStrategy = 'version-first';

      registerShare({
        lodash: {
          version: '4.17.21',
          lib: { name: 'lodash-app1' },
          scope: 'app1',
        },
      });

      registerShare({
        lodash: {
          version: '4.17.20',
          lib: { name: 'lodash-app2' },
          scope: 'app2',
        },
      });

      const module1 = await loadShare('lodash', { scope: 'app1' });
      const module2 = await loadShare('lodash', { scope: 'app2' });

      expect(module1).toEqual({ name: 'lodash-app1' });
      expect(module2).toEqual({ name: 'lodash-app2' });
      expect(module1).not.toBe(module2);
    });
  });

  describe('async module loading', () => {
    test('should handle async module loading functions', async () => {
      linkInstance.shareStrategy = 'version-first';

      registerShare({
        lodash: {
          version: '4.17.21',
          lib: async () => {
            return { name: 'lodash-async' };
          },
        },
      });

      const module = await loadShare('lodash');
      expect(module).toEqual({ name: 'lodash-async' });
    });

    test('should cache async loaded modules', async () => {
      linkInstance.shareStrategy = 'version-first';

      let loadCount = 0;
      registerShare({
        lodash: {
          version: '4.17.21',
          lib: async () => {
            loadCount++;
            return { name: 'lodash-async', count: loadCount };
          },
        },
      });

      const module1 = await loadShare('lodash');
      const module2 = await loadShare('lodash');

      expect(module1).toEqual({ name: 'lodash-async', count: 1 });
      expect(module2).toEqual({ name: 'lodash-async', count: 1 });
      expect(module1).toBe(module2);
    });
  });
});
