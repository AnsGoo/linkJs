import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown';
import tsdownPluginServer from 'tsdown-plugin-server';
import UnpluginLinkjs from 'unplugin-linkjs';

export default defineConfig({
  dts: false, // 禁用dts生成，避免rolldown-plugin-dts无法处理Vue文件的问题
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
    UnpluginLinkjs.rolldown({
      shared: {
        // linkjs: '$linkjs',
        'vue': 'Vue',
      },
    }),
    tsdownPluginServer({
      port: 4001,
    }),
   
  ],
  outputOptions: {
    globals: {
      linkjs: '$linkjs',
    },
  },
});
