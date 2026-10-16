import { describe, expect, test } from 'vitest';
import { collectRemoteDependencyGraph, detectRemoteDependencyCycles, findCyclicComponents } from '../src/remote-dep-graph';

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

describe('findCyclicComponents (SCC)', () => {
  const norm = (comps: string[][]) => comps.map((c) => [...c].sort()).sort();

  test('empty for a DAG', () => {
    expect(findCyclicComponents({ A: ['B'], B: ['C'], C: [] })).toEqual([]);
  });

  test('single SCC for A↔B', () => {
    expect(norm(findCyclicComponents({ A: ['B'], B: ['A'] }))).toEqual([['A', 'B']]);
  });

  test('detects a self-loop', () => {
    expect(findCyclicComponents({ A: ['A'] })).toEqual([['A']]);
  });

  test('two independent SCCs among a larger graph', () => {
    const comps = norm(findCyclicComponents({ A: ['B'], B: ['A', 'C'], C: ['D'], D: ['C'], E: ['A'] }));
    expect(comps).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
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

  test('applies the auth token to every manifest fetch', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      return { ok: true, json: async () => ({ remotes: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], {
      fetch: fetchImpl,
      auth: { token: 'T', queryParam: 'access_token' },
    });
    expect(seen).toEqual(['http://a/manifest.json?access_token=T']);
  });

  test('reports unresolved nodes (http-error / no-host) instead of silently treating as leaves', async () => {
    const unresolved: Array<{ name: string; reason: string }> = [];
    const hostless: Array<{ name: string; reason: string }> = [];
    await collectRemoteDependencyGraph([{ name: 'Root', host: 'http://root' }, { name: 'NoHost' }], {
      fetch: fakeFetch({}), // Root 的 manifest 404
      onUnresolved: (info) => {
        (info.reason === 'no-host' ? hostless : unresolved).push(info);
      },
    });
    expect(unresolved).toEqual([{ name: 'Root', host: 'http://root', reason: 'http-error', status: undefined }]);
    expect(hostless.map((i) => i.name)).toEqual(['NoHost']);
  });

  test('reports truncation when the graph exceeds maxNodes', async () => {
    let truncated: { processed: number; maxNodes: number; pending: number } | undefined;
    const chain = fakeFetch({
      'http://a': { B: { host: 'http://b' } },
      'http://b': { C: { host: 'http://c' } },
      'http://c': {},
    });
    await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], {
      fetch: chain,
      maxNodes: 2,
      onTruncated: (info) => {
        truncated = info;
      },
    });
    expect(truncated).toBeDefined();
    expect(truncated!.maxNodes).toBe(2);
    expect(truncated!.pending).toBeGreaterThan(0);
  });

  test('includes expose-level remote deps (manifest.exposes[].deps.remotes)', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('http://a')) {
        return {
          ok: true,
          json: async () => ({
            remotes: {},
            exposes: [{ name: 'X', deps: { remotes: { B: { host: 'http://b' } } } }],
          }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ remotes: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const graph = await collectRemoteDependencyGraph([{ name: 'A', host: 'http://a' }], { fetch: fetchImpl });
    expect(graph).toEqual({ A: ['B'], B: [] });
  });
});
