import { defineConfig } from 'tsdown'
import VuePlugin from 'unplugin-vue/rolldown';
import tsdownPluginServer from 'tsdown-plugin-server';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';
import * as Vue from 'vue';

export default defineConfig({
  // fromVite: true,
  dts: false,
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
  noExternal: ['vue', 'pinia', 'vue-router'],
  plugins: [
    VuePlugin(),
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
    // tsdownPluginServer({
    //   port: 4001,
    // }),
  ],
})
