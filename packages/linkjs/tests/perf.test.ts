import { beforeEach, expect, test } from 'vitest';
import { startPhase, measure, mark, getPerfEntries, clearPerfEntries } from '../src/perf';

beforeEach(() => clearPerfEntries());

test('startPhase records a measurement entry', async () => {
  const end = startPhase('linkjs:test');
  await new Promise((r) => setTimeout(r, 15));
  end();

  const entries = getPerfEntries();
  expect(entries.some((entry) => entry.name === 'linkjs:test')).toBe(true);
});

test('measure returns a non-negative duration and accumulates entries', () => {
  mark('a:start');
  const duration = measure('a', 'a:start', 'a:start');
  expect(duration).toBeGreaterThanOrEqual(0);
  expect(getPerfEntries().some((entry) => entry.name === 'a')).toBe(true);
});
