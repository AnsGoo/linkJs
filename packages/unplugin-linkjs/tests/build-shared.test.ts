import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { buildSharedPackageMap } from '../src/dependency-graph';
import { generateSharedEntryFile } from '../src/build-shared';

const require = createRequire(import.meta.url);
const samplePkgJson = require.resolve('oxc-parser/package.json');

describe('generateSharedEntryFile', () => {
  it('generates shared.js reusing existing chunks', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'linkjs-shared-'));
    try {
      const sharedPkgMap = buildSharedPackageMap(['oxc-parser'], outDir);
      const result = generateSharedEntryFile({
        outDir,
        baseDir: '/mf',
        shared: { 'oxc-parser': {} },
        bundle: {
          'oxc-parser-abc123.js': { type: 'chunk', facadeModuleId: samplePkgJson },
        },
        sharedPkgMap,
      });

      expect(result).toBe('/mf/shared.js');
      const content = readFileSync(join(outDir, 'shared.js'), 'utf-8');
      expect(content).toContain('OxcParser: () => import("./oxc-parser-abc123.js")');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('returns null when there are no shared deps', () => {
    const result = generateSharedEntryFile({
      outDir: tmpdir(),
      baseDir: '/mf',
      shared: {},
      bundle: {},
      sharedPkgMap: new Map(),
    });
    expect(result).toBeNull();
  });
});
