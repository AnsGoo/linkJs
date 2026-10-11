import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'tsdown';
import VuePlugin from 'unplugin-vue/rolldown';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';
import * as Vue from 'vue';

/**
 * 临时 workaround：当前 tsdown/rolldown-plugin-dts 处理 Vue SFC 声明时会把 vue 类型
 * 重命名为悬空的 `_$vue` 命名空间，dts 落盘后把 `_$vue.` 改写为 `import("vue").`，
 * 并同步更新 manifest 的 `metaData.typesHash`。rolldown 侧修复后可移除。
 */
function fixVueDtsPlugin(): Record<string, unknown> {
  return {
    name: 'linkjs-fix-vue-dts',
    writeBundle() {
      const dtsFile = resolve(process.cwd(), 'mf/lib.d.ts');
      if (!existsSync(dtsFile)) {
        return;
      }
      const original = readFileSync(dtsFile, 'utf-8');
      if (!original.includes('_$vue')) {
        return;
      }
      const patched = original.replaceAll('_$vue.', 'import("vue").');
      writeFileSync(dtsFile, patched, 'utf-8');

      const manifestFile = resolve(process.cwd(), 'mf/manifest.json');
      if (existsSync(manifestFile)) {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
        manifest.metaData = {
          ...(manifest.metaData || {}),
          typesHash: `sha384-${createHash('sha384').update(patched).digest('base64')}`,
        };
        writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
      }
    },
  };
}

export default defineConfig({
  tsconfig: './tsconfig.dts.json',
  dts: {
    vue: true,
  }, // 启用dts生成
  format: ['esm'],
  target: 'esnext',
  platform: 'browser',
  entry: 'src/lib.ts',
  globalName: 'remoteLib',
  css: {
    splitting: false,
  },
  sourcemap: true,
  outDir: 'mf',
  exports: false,
  external: [],
  noExternal: ['vue', 'pinia', 'vue-router'],
  plugins: [
    VuePlugin({
      isProduction: true,
    }),
    unpluginLinkjsRollowPlugin({
      shared: {
        vue: {
          lib: Vue,
          scope: 'global',
          singleton: true,
        },
        pinia: {
          lib: () => import('pinia'),
          scope: 'global',
          singleton: true,
        },
        'vue-router': {
          lib: () => import('vue-router'),
          scope: 'global',
          singleton: true,
        },
      },
    }),
    // 修正 Vue SFC 声明中的悬空 `_$vue` 命名空间（见上方说明）
    fixVueDtsPlugin(),
    // tsdownPluginServer({
    //   port: 4001,
    // }),
  ],
});
