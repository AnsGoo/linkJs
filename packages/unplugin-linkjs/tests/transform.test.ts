import { describe, expect, it } from 'vitest';
import { parseSync } from 'oxc-parser';
import { unpluginLinkjs } from '../src/index';

function getTransform() {
  const created: any = unpluginLinkjs.vite({ shared: { vue: { lib: () => Promise.resolve({}) } } });
  const plugin = Array.isArray(created) ? created[0] : created;
  const transform = plugin.transform;
  return typeof transform === 'function' ? transform : transform.handler;
}

function run(code: string, id = '/proj/src/app.ts') {
  const transform = getTransform();
  const ctx: any = { parse: (c: string) => parseSync('file.ts', c).program };
  return transform.call(ctx, code, id);
}

describe('vite(dev) transform', () => {
  it('rewrites named shared imports to loadShare', () => {
    const result = run(`import { ref, computed as c } from 'vue';`);
    expect(result.code).toContain(`= await $linkjs.loadShare("vue")`);
    expect(result.code).toContain('const { ref, computed: c } =');
  });

  it('handles default import', () => {
    const result = run(`import Vue from 'vue';`);
    expect(result.code).toContain(`const Vue = (await $linkjs.loadShare("vue")).default;`);
  });

  it('handles namespace import', () => {
    const result = run(`import * as Vue from 'vue';`);
    expect(result.code).toContain(`const Vue = await $linkjs.loadShare("vue");`);
  });

  it('keeps linkjs import untouched in dev', () => {
    const result = run(`import { expose } from 'linkjs';\nexpose('x', {});`);
    expect(result).toBeNull();
  });
});
