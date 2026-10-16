import { beforeEach, describe, expect, test, vi } from 'vitest';
import { linkInstance } from '../src/state/instance';
import { LOAD_STATUS } from '../src/event-bus/constant';
import { resolveRemoteDeps, retainRemote, releaseRemote, hasDependencyCycle, retainExpose, releaseExpose } from '../src/loader/deps';
import { clearDiagnostics, getDiagnostics } from '../src/devtools';

function register(name: string, remotes?: Record<string, unknown>, version?: string) {
  linkInstance.remotes.set(name, {
    name,
    entry: '',
    status: LOAD_STATUS.UNLOADED,
    ...(remotes ? { remotes: remotes as never } : {}),
    ...(version ? { version } : {}),
  });
}

/** 记录加载顺序的假 loadOne，并把依赖标记为 loaded。 */
function recorder(order: string[], version = '1.0.0') {
  return vi.fn(async (name: string) => {
    order.push(name);
    const info = linkInstance.remotes.get(name)!;
    info.status = LOAD_STATUS.LOADED;
    info.version = info.version || version;
    return null;
  });
}

function ctx(loadOne: (name: string, dep: any) => Promise<unknown>) {
  return { stack: ['root'], inflight: new Map<string, Promise<unknown>>(), loadOne };
}

beforeEach(() => {
  linkInstance.remotes.clear();
  linkInstance.remoteInflight = new Map();
  linkInstance.remoteRefs = new Map();
  clearDiagnostics();
});

describe('resolveRemoteDeps', () => {
  test('loads dependencies in topological order (deps before dependents)', async () => {
    register('A', { B: {} });
    register('B', { C: {} });
    register('C');
    const order: string[] = [];
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder(order)));
    expect(order).toEqual(['C', 'B']);
  });

  test('deduplicates shared dependencies', async () => {
    register('A', { B: {}, C: {} });
    register('B', { D: {} });
    register('C', { D: {} });
    register('D');
    const order: string[] = [];
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder(order)));
    expect(order.filter((n) => n === 'D')).toHaveLength(1);
  });

  test('skips already-loaded dependencies', async () => {
    register('A', { B: {} });
    register('B', undefined, '1.0.0');
    linkInstance.remotes.get('B')!.status = LOAD_STATUS.LOADED;
    const order: string[] = [];
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder(order)));
    expect(order).toEqual([]);
  });

  test('tolerates cycles without infinite recursion', async () => {
    register('A', { B: {} });
    register('B', { A: {} });
    const order: string[] = [];
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder(order)));
    expect(order).toEqual(['B']);
    expect(getDiagnostics().some((d) => d.code === 'REMOTE_DEP_CYCLE')).toBe(true);
  });

  test('reports version mismatch only when version is declared', async () => {
    register('A', { B: { version: '^1.0.0' } });
    register('B', undefined, '2.0.0');
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder([], '2.0.0')));
    expect(getDiagnostics().some((d) => d.code === 'REMOTE_DEP_VERSION_MISMATCH')).toBe(true);
  });

  test('does not check version when none declared', async () => {
    register('A', { B: {} });
    register('B', undefined, '9.9.9');
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder([], '9.9.9')));
    expect(getDiagnostics().some((d) => d.code === 'REMOTE_DEP_VERSION_MISMATCH')).toBe(false);
  });

  test('throws for required dep failure, warns for optional', async () => {
    register('A', { B: {} });
    register('A2', { B: { required: false } });
    const boom = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(boom))).rejects.toThrow('boom');
    await expect(resolveRemoteDeps('A2', linkInstance.remotes.get('A2')?.remotes ?? {}, ctx(boom))).resolves.toBeUndefined();
    expect(getDiagnostics().some((d) => d.code === 'REMOTE_DEP_ERROR' && d.level === 'warn')).toBe(true);
  });

  test('retains a reference for each loaded dependency', async () => {
    register('A', { B: {}, C: {} });
    register('B');
    register('C');
    await resolveRemoteDeps('A', linkInstance.remotes.get('A')?.remotes ?? {}, ctx(recorder([])));
    expect(linkInstance.remoteRefs?.get('B')).toBe(1);
    expect(linkInstance.remoteRefs?.get('C')).toBe(1);
  });

  test('uses the provided deps map (expose-level), not the remote-level remotes', async () => {
    register('A'); // 无 remote 级 remotes
    register('B');
    const order: string[] = [];
    // 显式传入 deps（等价 exposes[E].deps.remotes）
    await resolveRemoteDeps('A', { B: {} }, ctx(recorder(order)));
    expect(order).toEqual(['B']);
  });

  test('honors host override from the provided deps map', async () => {
    register('A');
    const order: string[] = [];
    await resolveRemoteDeps('A', { B: { host: 'http://localhost:9000' } }, ctx(recorder(order)));
    expect(linkInstance.remotes.get('B')?.host).toBe('http://localhost:9000');
  });
});

describe('hasDependencyCycle', () => {
  test('false for a DAG', () => {
    expect(hasDependencyCycle({ A: ['B'], B: ['C'], C: [] })).toBe(false);
  });
  test('true for a 2-node cycle', () => {
    expect(hasDependencyCycle({ A: ['B'], B: ['A'] })).toBe(true);
  });
  test('true for a self-loop', () => {
    expect(hasDependencyCycle({ A: ['A'] })).toBe(true);
  });
  test('handles deep chains without stack overflow', () => {
    const graph: Record<string, string[]> = {};
    for (let i = 0; i < 20000; i++) graph[`n${i}`] = [`n${i + 1}`];
    expect(hasDependencyCycle(graph)).toBe(false);
  });
});

describe('reference counting', () => {
  test('retain/release adjust the counter', () => {
    retainRemote('B');
    retainRemote('B');
    expect(releaseRemote('B')).toBe(1);
    expect(releaseRemote('B')).toBe(0);
  });

  test('expose refcount tracks consumers', () => {
    retainExpose('remote-lib/HelloWorld');
    retainExpose('remote-lib/HelloWorld');
    expect(releaseExpose('remote-lib/HelloWorld')).toBe(1);
    expect(releaseExpose('remote-lib/HelloWorld')).toBe(0);
  });
});
