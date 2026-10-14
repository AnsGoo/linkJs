import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { build } from 'rolldown';
import { unpluginLinkjs } from '../src/index';

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'linkjs-fixture-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-remote', version: '1.2.3' }), 'utf-8');
  // 组件：依赖 vue（计入 expose 闭包 shared）
  writeFileSync(
    join(dir, 'src', 'HelloWorld.ts'),
    `import { h } from 'vue';\nexport default { render: () => h('div', 'hi') };\n`,
    'utf-8',
  );
  // 入口：expose('fixture', { HelloWorld })，只 HelloWorld 依赖 vue
  writeFileSync(
    join(dir, 'src', 'entry.ts'),
    `import HelloWorld from './HelloWorld';\nimport { expose } from 'linkjs';\nexpose('fixture', { HelloWorld });\nexport default {};\n`,
    'utf-8',
  );
  return dir;
}

describe('exposes[].deps（集成：programmatic rolldown 构建）', () => {
  it('按 expose() 解析出 name 与各自模块闭包的 deps', async () => {
    const dir = makeFixture();
    const outDir = join(dir, 'dist');

    const plugins = unpluginLinkjs.rolldown({
      shared: { vue: { lib: 'vue' } },
      mode: 'production',
    });
    const pluginList = Array.isArray(plugins) ? plugins : [plugins];

    await build({
      input: join(dir, 'src', 'entry.ts'),
      external: ['vue', 'linkjs'],
      output: { dir: outDir, format: 'esm' },
      plugins: [pluginList.flat() as never],
    });

    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'));
    expect(Array.isArray(manifest.exposes)).toBe(true);
    const hello = manifest.exposes.find((e: { name: string }) => e.name === 'HelloWorld');
    expect(hello, 'exposes 应含 expose 名 HelloWorld').toBeTruthy();
    expect(hello.deps.shared).toContain('vue');
    expect(hello.deps.remotes).toEqual({});
  }, 30000);
});
