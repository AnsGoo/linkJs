import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown';
import tsdownPluginServer from 'tsdown-plugin-server';
import UnpluginLinkjs from 'unplugin-linkjs';

export default defineConfig({
  dts: false, // 禁用dts生成，避免rolldown-plugin-dts无法处理Vue文件的问题
  format: ['esm', 'umd', 'iife'],
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
  external: ['vue', 'linkjs'],
  plugins: [
    UnpluginLinkjs.rolldown(),
    tsdownPluginServer({
      port: 4001,
    }),
    Vue({
      isProduction: true,
    }),
  ],
  outputOptions: {
    globals: {
      vue: 'Vue',
      linkjs: '$linkjs',
    },
  },
});
