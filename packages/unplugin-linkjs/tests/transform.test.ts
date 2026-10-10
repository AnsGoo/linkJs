import { describe, expect, it } from 'vitest';
import { parseSync } from 'oxc-parser';
import { unpluginLinkjs } from '../src/index';

function getTransform(options?: any) {
  const created: any = unpluginLinkjs.vite({ shared: { vue: { lib: () => Promise.resolve({}) } }, ...options });
  const plugin = Array.isArray(created) ? created[0] : created;
  const transform = plugin.transform;
  return typeof transform === 'function' ? transform : transform.handler;
}

function run(code: string, id = '/proj/src/app.ts', options?: any) {
  const transform = getTransform(options);
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

  it('keeps linkjs import untouched in dev but injects entry self-accept when expose is called', () => {
    const result = run(`import { expose } from 'linkjs';\nexpose('x', {});`);
    expect(result.code).not.toContain(`$linkjs`);
    expect(result.code).toContain(`import.meta.hot.accept()`);
  });

  it('does not inject self-accept for modules without expose', () => {
    const result = run(`import { getShare } from 'linkjs';\ngetShare('vue');`);
    expect(result).toBeNull();
  });

  it('rewrites adaptiveRuntime deps to loadRuntime', () => {
    const result = run(`import { ref } from 'vue';`, '/proj/src/app.ts', { adaptiveRuntime: ['vue'] });
    expect(result.code).toContain(`$linkjs.loadRuntime("vue", () => import("vue"))`);
  });
});
