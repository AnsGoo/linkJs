import { defineConfig } from 'tsdown';
import VuePlugin from 'unplugin-vue/rolldown';
import tsdownPluginServer from 'tsdown-plugin-server';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';
import * as Vue from 'vue';

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
  exports: {
    devExports: 'development',
  },
  external: [],
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
    tsdownPluginServer({
      port: 4001,
    }),
  ],
});
