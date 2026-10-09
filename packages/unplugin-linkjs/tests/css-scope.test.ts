import { describe, expect, it } from 'vitest';
import { scopeSelector, createCssScopePlugin, LINKJS_SCOPE_ATTR } from '../src/css-scope';

const attr = `[${LINKJS_SCOPE_ATTR}="remote"]`;

describe('scopeSelector', () => {
  it('prefixes normal selectors', () => {
    expect(scopeSelector('h1', attr)).toBe(`${attr} h1`);
  });

  it('maps html/body/:root to the scope container', () => {
    expect(scopeSelector('body', attr)).toBe(attr);
    expect(scopeSelector(':root', attr)).toBe(attr);
  });

  it('leaves :global(...) untouched', () => {
    expect(scopeSelector(':global(.foo)', attr)).toBe('.foo');
  });

  it('handles selector lists', () => {
    expect(scopeSelector('a, b', attr)).toBe(`${attr} a, ${attr} b`);
  });

  it('does not double scope', () => {
    expect(scopeSelector(`${attr} h1`, attr)).toBe(`${attr} h1`);
  });
});

describe('createCssScopePlugin', () => {
  it('scopes rule selectors', () => {
    const plugin = createCssScopePlugin('remote') as any;
    const rule = { selectors: ['h1', '.card'], parent: null };
    plugin.Rule(rule);
    expect(rule.selectors).toEqual([`${attr} h1`, `${attr} .card`]);
  });

  it('skips keyframes children', () => {
    const plugin = createCssScopePlugin('remote') as any;
    const rule = { selectors: ['from', '50%'], parent: { type: 'atrule', name: 'keyframes' } };
    plugin.Rule(rule);
    expect(rule.selectors).toEqual(['from', '50%']);
  });
});
