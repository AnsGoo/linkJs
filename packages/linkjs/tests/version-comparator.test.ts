import { describe, expect, test, beforeEach } from 'vitest';
import { VersionComparator } from '../src/share/version-comparator';

describe('VersionComparator', () => {
  describe('findBestMatch', () => {
    test('should return null when versionRange is undefined', () => {
      const result = VersionComparator.findBestMatch(undefined, [], []);
      expect(result).toBeNull();
    });

    test('should return best match from loaded versions', () => {
      const loadedVersions = [
        { version: '1.0.0', module: { name: 'v1' } },
        { version: '2.0.0', module: { name: 'v2' } },
        { version: '3.0.0', module: { name: 'v3' } },
      ];

      const result = VersionComparator.findBestMatch('^2.0.0', loadedVersions, []);

      expect(result).not.toBeNull();
      expect(result?.module).toEqual({ name: 'v2' });
    });

    test('should return best match from available versions when no loaded match', () => {
      const loadedVersions = [{ version: '1.0.0', module: { name: 'v1' } }];

      const availableVersions = [
        { version: '2.0.0', module: { name: 'v2' } },
        { version: '3.0.0', module: { name: 'v3' } },
      ];

      const result = VersionComparator.findBestMatch('^2.0.0', loadedVersions, availableVersions);

      expect(result).not.toBeNull();
      expect(result?.module).toEqual({ name: 'v2' });
    });

    test('should return null when no version matches', () => {
      const loadedVersions = [{ version: '1.0.0', module: { name: 'v1' } }];

      const availableVersions = [{ version: '2.0.0', module: { name: 'v2' } }];

      const result = VersionComparator.findBestMatch('^5.0.0', loadedVersions, availableVersions);

      expect(result).toBeNull();
    });
  });

  describe('findLatestVersion', () => {
    test('should return null when versions array is empty', () => {
      const result = VersionComparator.findLatestVersion([]);
      expect(result).toBeNull();
    });

    test('should return the latest version', () => {
      const versions = [
        { version: '1.0.0', module: { name: 'v1' } },
        { version: '2.0.0', module: { name: 'v2' } },
        { version: '3.0.0', module: { name: 'v3' } },
      ];

      const result = VersionComparator.findLatestVersion(versions);

      expect(result).not.toBeNull();
      expect(result?.module).toEqual({ name: 'v3' });
    });

    test('should handle unsorted versions', () => {
      const versions = [
        { version: '3.0.0', module: { name: 'v3' } },
        { version: '1.0.0', module: { name: 'v1' } },
        { version: '2.0.0', module: { name: 'v2' } },
      ];

      const result = VersionComparator.findLatestVersion(versions);

      expect(result).not.toBeNull();
      expect(result?.module).toEqual({ name: 'v3' });
    });

    test('should handle versions with prerelease', () => {
      const versions = [
        { version: '1.0.0', module: { name: 'v1' } },
        { version: '1.0.0-alpha', module: { name: 'v1-alpha' } },
        { version: '1.0.0-beta', module: { name: 'v1-beta' } },
      ];

      const result = VersionComparator.findLatestVersion(versions);

      expect(result).not.toBeNull();
      expect(result?.module).toEqual({ name: 'v1-beta' });
    });
  });

  describe('satisfiesVersion', () => {
    test('should return true when version satisfies range', () => {
      const result = VersionComparator.satisfiesVersion('2.0.0', '^2.0.0');
      expect(result).toBe(true);
    });

    test('should return false when version does not satisfy range', () => {
      const result = VersionComparator.satisfiesVersion('1.0.0', '^2.0.0');
      expect(result).toBe(false);
    });

    test('should handle tilde ranges', () => {
      const result = VersionComparator.satisfiesVersion('2.0.5', '~2.0.0');
      expect(result).toBe(true);
    });

    test('should handle exact versions', () => {
      const result = VersionComparator.satisfiesVersion('2.0.0', '2.0.0');
      expect(result).toBe(true);
    });
  });

  describe('isValidVersion', () => {
    test('should return true for valid semantic versions', () => {
      expect(VersionComparator.isValidVersion('1.0.0')).toBe(true);
      expect(VersionComparator.isValidVersion('2.1.3')).toBe(true);
      expect(VersionComparator.isValidVersion('1.0.0-alpha')).toBe(true);
    });

    test('should return false for invalid versions', () => {
      expect(VersionComparator.isValidVersion('invalid')).toBe(false);
      expect(VersionComparator.isValidVersion('')).toBe(false);
      expect(VersionComparator.isValidVersion('abc')).toBe(false);
    });

    test('should coerce non-standard versions', () => {
      expect(VersionComparator.isValidVersion('v1.0.0')).toBe(true);
      expect(VersionComparator.isValidVersion('1')).toBe(true);
    });
  });
});
