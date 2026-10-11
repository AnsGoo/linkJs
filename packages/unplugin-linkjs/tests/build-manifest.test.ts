import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateManifestFile, resolveShareScopes } from '../src/build-manifest';

describe('resolveShareScopes', () => {
  it('prefers the explicit declaration (deduped)', () => {
    expect(resolveShareScopes({ vue: { scope: 'shared-ui' } }, ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('derives scopes from shared deps when not declared', () => {
    const scopes = resolveShareScopes({ vue: { scope: 'ui' }, pinia: {}, extra: { scope: 'global' } });
    expect([...scopes].sort()).toEqual(['global', 'ui']);
  });

  it('defaults to global', () => {
    expect(resolveShareScopes({})).toEqual(['global']);
  });
});

describe('generateManifestFile', () => {
  it('writes the declared shareScope into manifest.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'linkjs-manifest-'));
    try {
      generateManifestFile(outDir, [], { vue: { scope: 'shared-ui' } }, {}, ['shared-ui', 'global']);
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
      expect(manifest.shareScope).toEqual(['shared-ui', 'global']);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('derives shareScope when omitted', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'linkjs-manifest-'));
    try {
      generateManifestFile(outDir, [], { vue: { scope: 'ui' } });
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
      expect(manifest.shareScope).toEqual(['ui']);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('writes publicPath when provided', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'linkjs-manifest-'));
    try {
      generateManifestFile(outDir, [], {}, {}, undefined, 'https://cdn.example.com/remote/');
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
      expect(manifest.publicPath).toBe('https://cdn.example.com/remote/');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
