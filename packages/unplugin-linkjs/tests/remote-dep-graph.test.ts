import { describe, expect, test } from 'vitest';
import { collectRemoteDependencyGraph, detectRemoteDependencyCycles } from '../src/remote-dep-graph';

/** 用「host -> remotes」映射伪造 fetch。 */
function fakeFetch(map: Record<string, Record<string, { host?: string }>>): typeof fetch {
  return (async (input: string | URL) => {
    const url = new URL(String(input));
    const origin = url.origin;
    const remotes = map[origin];
    if (!remotes) {
      return { ok: false, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ remotes }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('detectRemoteDependencyCycles', () => {
  test('returns no cycles for a DAG', () => {
    const graph = { A: ['B'], B: ['C'], C: [] as string[] };
    expect(detectRemoteDependencyCycles(graph)).toEqual([]);
  });

  test('detects a 2-node cycle', () => {
    const graph = { A: ['B'], B: ['A'] };
    const cycles = detectRemoteDependencyCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0][0]).toBe(cycles[0][cycles[0].length - 1]);
    expect(new Set(cycles[0])).toEqual(new Set(['A', 'B']));
  });

  test('detects a self-loop', () => {
    const cycles = detectRemoteDependencyCycles({ A: ['A'] });
    expect(cycles).toEqual([['A', 'A']]);
  });

  test('detects a 3-node cycle among a larger graph', () => {
    const graph = { A: ['B'], B: ['C'], C: ['A'], D: ['A'] };
    const cycles = detectRemoteDependencyCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].slice(0, -1).sort()).toEqual(['A', 'B', 'C']);
  });

  test('handles deep chains without stack overflow', () => {
    const graph: Record<string, string[]> = {};
    for (let i = 0; i < 20000; i++) graph[`n${i}`] = [`n${i + 1}`];
    expect(detectRemoteDependencyCycles(graph)).toEqual([]);
  });
});

describe('collectRemoteDependencyGraph', () => {
  test('collects transitive remote deps (DAG)', async () => {
    const graph = await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], {
      fetch: fakeFetch({
        'http://a': { B: { host: 'http://b' } },
        'http://b': { C: { host: 'http://c' } },
        'http://c': {},
      }),
    });
    expect(graph).toEqual({ A: ['B'], B: ['C'], C: [] });
  });

  test('detects a cycle across manifests (A→B→A)', async () => {
    const graph = await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], {
      fetch: fakeFetch({
        'http://a': { B: { host: 'http://b' } },
        'http://b': { A: { host: 'http://a' } },
      }),
    });
    const cycles = detectRemoteDependencyCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0])).toEqual(new Set(['A', 'B']));
  });

  test('treats unreachable manifests as leaves (no false cycle)', async () => {
    const graph = await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], {
      fetch: fakeFetch({}), // 全部 404
    });
    expect(graph).toEqual({ A: [] });
  });
});
