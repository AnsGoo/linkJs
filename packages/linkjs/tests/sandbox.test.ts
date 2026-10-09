import { describe, expect, it, beforeEach } from 'vitest';
import { captureSnapshot, restoreSnapshot, activateSandbox, deactivateSandbox, deactivateAllSandboxes } from '../src/sandbox';

function cleanup() {
  delete (globalThis as any).__sb_added__;
  delete (globalThis as any).__sb_mut__;
  delete (globalThis as any).__sb_from_remote__;
}

beforeEach(cleanup);

describe('snapshot sandbox', () => {
  it('removes globals added after the snapshot and restores modified ones', () => {
    (globalThis as any).__sb_mut__ = 'original';
    const snapshot = captureSnapshot();

    (globalThis as any).__sb_added__ = 123;
    (globalThis as any).__sb_mut__ = 'changed';

    restoreSnapshot(snapshot);

    expect('__sb_added__' in globalThis).toBe(false);
    expect((globalThis as any).__sb_mut__).toBe('original');
  });

  it('does not remove protected linkjs keys', () => {
    delete (globalThis as any).$linkjs;
    const snapshot = captureSnapshot();

    (globalThis as any).$linkjs = { added: true };
    restoreSnapshot(snapshot);

    expect((globalThis as any).$linkjs).toEqual({ added: true });
  });
});

describe('named sandbox registry', () => {
  it('activates and deactivates a named sandbox', () => {
    activateSandbox('remote');
    (globalThis as any).__sb_from_remote__ = 1;

    expect(deactivateSandbox('remote')).toBe(true);
    expect('__sb_from_remote__' in globalThis).toBe(false);
    expect(deactivateSandbox('remote')).toBe(false);
  });

  it('deactivates all sandboxes', () => {
    activateSandbox('a');
    activateSandbox('b');
    (globalThis as any).__sb_added__ = 1;

    deactivateAllSandboxes();
    expect('__sb_added__' in globalThis).toBe(false);
  });
});
