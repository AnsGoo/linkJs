import { defineConfig } from 'tsdown'
import VuePlugin from 'unplugin-vue/rolldown';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';
import tsdownPluginServer from 'tsdown-plugin-server';
import * as Vue from 'vue';

// 仅在 `tsdown --watch`（即 pnpm dev）时启动静态服务器；
// 普通 `pnpm build` 不应因长期驻留的 HTTP server 而卡住。
const isWatch = process.argv.includes('--watch');

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
  exports: false,
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
    // 把 mf/ 产物以静态服务器形式暴露在 4001，供宿主 loadLib 加载
    ...(isWatch
      ? [
          tsdownPluginServer({
            port: 4001,
          }),
        ]
      : []),
  ],
})
