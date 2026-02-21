import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown';
import tsdownPluginServer from 'tsdown-plugin-server';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';

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
    Vue({
      isProduction: true,
    }),
    unpluginLinkjsRollowPlugin({
      shared: {
        // linkjs: '$linkjs',
        vue: 'Vue',
      },
    }),
    tsdownPluginServer({
      port: 4001,
    }),
  ],
});
