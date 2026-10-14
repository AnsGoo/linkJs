import { describe, expect, it } from 'vitest';
import { parseSync } from 'oxc-parser';
import { collectExposeDecls, collectImportSources, resolveExposeSources } from '../src/expose-parse';

const parse = (code: string) => parseSync('file.ts', code).program;

describe('expose-parse', () => {
  it('collects expose name → module source', () => {
    const code = `import HelloWorld from './components/HelloWorld.vue';
import { expose } from 'linkjs';
expose('remote-lib', { HelloWorld });
`;
    const map = resolveExposeSources(parse(code));
    expect(map.get('HelloWorld')).toBe('./components/HelloWorld.vue');
  });

  it('handles string keys and non-identifier values', () => {
    const code = `import A from './A.vue';
expose('r', { 'Exposed-A': A, Inline: defineComponent({}) });`;
    const map = resolveExposeSources(parse(code));
    expect(map.has('Exposed-A')).toBe(true);
    expect(map.get('Exposed-A')).toBe('./A.vue');
    expect(map.get('Inline')).toBeUndefined();
  });

  it('maps import locals to sources (default / renamed / namespace)', () => {
    const code = `import A from './a.vue';
import { B as C } from './b';
import * as Ns from './ns';`;
    const m = collectImportSources(parse(code));
    expect(m.get('A')).toBe('./a.vue');
    expect(m.get('C')).toBe('./b');
    expect(m.get('Ns')).toBe('./ns');
  });

  it('returns [] when there is no expose call', () => {
    expect(collectExposeDecls(parse(`const a = 1;`))).toEqual([]);
  });

  it('collects multiple exposes from one call', () => {
    const code = `import A from './A.vue';
import B from './B.vue';
expose('r', { A, B });`;
    const map = resolveExposeSources(parse(code));
    expect([...map.keys()].sort()).toEqual(['A', 'B']);
    expect(map.get('B')).toBe('./B.vue');
  });
});
