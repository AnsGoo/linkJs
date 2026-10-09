import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { extractPkgName, buildSharedPackageMap, analyzeDependencies } from '../src/dependency-graph';

const require = createRequire(import.meta.url);

const samplePkgJson = require.resolve('oxc-parser/package.json');
const samplePkgDir = samplePkgJson.slice(0, samplePkgJson.lastIndexOf('/'));

describe('extractPkgName', () => {
  it('reads the real package name from the nearest package.json', () => {
    expect(extractPkgName(samplePkgJson)).toBe('oxc-parser');
  });

  it('returns null for non-absolute / virtual paths', () => {
    expect(extractPkgName('\0virtual:foo')).toBeNull();
    expect(extractPkgName('relative/file.ts')).toBeNull();
  });
});

describe('buildSharedPackageMap', () => {
  it('maps a shared package to itself', () => {
    const map = buildSharedPackageMap(['oxc-parser'], samplePkgDir);
    expect(map.get('oxc-parser')).toBe('oxc-parser');
  });
});

describe('analyzeDependencies', () => {
  it('returns empty dependencies for a leaf shared package', () => {
    const result = analyzeDependencies({ 'oxc-parser': {} });
    expect(result['oxc-parser']).toEqual([]);
  });
});
