import { describe, expect, it } from 'vitest';
import { resolveShareScopes } from '../src/loader/utils';

describe('resolveShareScopes', () => {
  it('prefers the explicit shareScope', () => {
    expect(resolveShareScopes({ name: 'r', entry: '', shareScope: ['ui', 'global'] })).toEqual(['ui', 'global']);
  });

  it('derives scopes from shared dep configs', () => {
    const info = {
      name: 'r',
      entry: '',
      shared: { vue: { scope: 'ui' }, pinia: { scope: 'global' } },
    };
    expect([...resolveShareScopes(info)].sort()).toEqual(['global', 'ui']);
  });

  it('falls back to the default scope when nothing is declared', () => {
    expect(resolveShareScopes({ name: 'r', entry: '' })).toEqual([undefined]);
  });
});
