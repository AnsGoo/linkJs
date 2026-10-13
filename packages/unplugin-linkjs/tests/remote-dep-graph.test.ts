import { describe, expect, test } from 'vitest';
import { detectRemoteDependencyCycles } from '../src/remote-dep-graph';

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
