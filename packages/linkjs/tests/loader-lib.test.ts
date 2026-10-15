// 注意：本文件运行在 node 环境（happy-dom 会拦截 file:// 动态 import），
// 仅 CSS 注入用例临时 mock 一个最小 document。
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLib, clearRemoteCache, unloadLib } from '../src/loader';
import { linkInstance } from '../src/state/instance';
import { LOAD_STATUS } from '../src/event-bus/constant';
import { clearDiagnostics, getDiagnostics } from '../src/devtools';

/** 生成会通过全局单例触发 LIB_EXPOSE 的真实 ESM 入口。 */
function writeEntry(dir: string, code: string): void {
  writeFileSync(join(dir, 'entry.mjs'), code, 'utf-8');
}

function exposeEntry(libName: string): string {
  // 事件名与 src/event-bus/constant.ts 的 LIB_EXPOSE 常量一致（'libExpose'）
  return `
const instance = globalThis.__linkjs_instance__;
instance.eventBus.emit('libExpose', {
  libName: '${libName}',
  lib: { default: 'DEFAULT_MOD', Comp: 'NAMED_MOD' },
});
export default {};
`;
}

function makeHost(dir: string): string {
  return `${pathToFileURL(dir).href}/`;
}

/** 注册远程库（声明 JS 入口；entry 形态与 manifest 一致）。 */
function registerLib(name: string, entry: string | Record<string, string>): void {
  linkInstance.remotes.set(name, { name, entry: entry as never, status: LOAD_STATUS.UNLOADED });
}

beforeEach(() => {
  linkInstance.remotes.clear();
  clearRemoteCache();
  clearDiagnostics();
  vi.restoreAllMocks();
});

describe('loadLib', () => {
  it('dynamically imports the JS entry and resolves the default expose', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, exposeEntry('remote-lib'));
    registerLib('remote-lib', { js: 'entry.mjs' });

    const result = await loadLib('remote-lib', { host: makeHost(dir) });
    expect(result).toBe('DEFAULT_MOD');
    expect(linkInstance.remotes.get('remote-lib')?.status).toBe(LOAD_STATUS.LOADED);
  });

  it('resolves the named expose for "<remote>/<Expose>" entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, exposeEntry('remote-lib'));
    registerLib('remote-lib', { js: 'entry.mjs' });

    const result = await loadLib('remote-lib/Comp', { host: makeHost(dir) });
    expect(result).toBe('NAMED_MOD');
  });

  it('returns the cached module on subsequent loads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, exposeEntry('remote-lib'));
    registerLib('remote-lib', { js: 'entry.mjs' });

    await loadLib('remote-lib', { host: makeHost(dir) });
    await expect(loadLib('remote-lib/Comp', { host: makeHost(dir) })).resolves.toBe('NAMED_MOD');
  });

  it('injects entry css as a stylesheet link (document fallback without Shadow DOM)', async () => {
    const links: Array<{ rel: string; href: string; dataset: Record<string, string> }> = [];
    (globalThis as any).document = {
      querySelector: () => null,
      createElement: () => ({ rel: '', href: '', dataset: {} }),
      head: { appendChild: (el: (typeof links)[number]) => links.push(el) },
    };
    try {
      const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
      writeEntry(dir, exposeEntry('remote-lib'));
      registerLib('remote-lib', { js: 'entry.mjs', css: 'style.css' });

      await loadLib('remote-lib', { host: makeHost(dir) });

      expect(links.some((l) => l.rel === 'stylesheet' && l.href.includes('style.css'))).toBe(true);
    } finally {
      delete (globalThis as any).document;
    }
  });

  it('rejects and records a diagnostic when the entry never exposes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, 'export default {};');
    registerLib('silent-lib', { js: 'entry.mjs' });

    await expect(loadLib('silent-lib', { host: makeHost(dir), timeout: 100 })).rejects.toThrow(
      /Timeout waiting for module silent-lib to expose/,
    );
    expect(linkInstance.remotes.get('silent-lib')?.status).toBe(LOAD_STATUS.UNLOADED);
    expect(getDiagnostics().some((d) => d.code === 'LOAD_REMOTE_ERROR')).toBe(true);
  });

  it('rejects when the entry module fails to import', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    registerLib('missing-lib', { js: 'missing.mjs' });

    await expect(loadLib('missing-lib', { host: makeHost(dir) })).rejects.toThrow();
    expect(linkInstance.remotes.get('missing-lib')?.status).toBe(LOAD_STATUS.UNLOADED);
    expect(getDiagnostics().some((d) => d.code === 'LOAD_REMOTE_ERROR')).toBe(true);
  });

  it('tolerates a failing shared entry and still loads the main module', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, exposeEntry('remote-lib'));
    registerLib('remote-lib', { js: 'entry.mjs', shared: 'missing-shared.js' });

    const result = await loadLib('remote-lib', { host: makeHost(dir) });
    expect(result).toBe('DEFAULT_MOD');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('unloadLib clears the cache and resets status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linkjs-lib-'));
    writeEntry(dir, exposeEntry('remote-lib'));
    registerLib('remote-lib', { js: 'entry.mjs' });

    await loadLib('remote-lib', { host: makeHost(dir) });
    unloadLib('remote-lib');
    expect(linkInstance.remotes.get('remote-lib')?.status).toBe(LOAD_STATUS.UNLOADED);

    // 缓存已清：带 cache-bust 查询串重新加载会重新执行入口模块（Node 按 URL 缓存 ESM）
    writeEntry(dir, exposeEntry('remote-lib').replace('DEFAULT_MOD', 'FRESH_MOD'));
    await expect(loadLib('remote-lib', { host: makeHost(dir), entryName: 'entry.mjs?v=2' })).resolves.toBe('FRESH_MOD');
  });
});
