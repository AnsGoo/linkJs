import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown'
import tsdownPluginServer from 'tsdown-plugin-server'


export default defineConfig({
  exports: true,
  dts: false, // 禁用dts生成，避免rolldown-plugin-dts无法处理Vue文件的问题
  target: 'esnext',
  platform: 'browser',
  entry: 'src/index.ts',
  outDir: 'mf',
  exports: {
    devExports: 'development',
  },
  plugins: [
    tsdownPluginServer({
      port: 4001,
    }),
    Vue({
      isProduction: true,
    }) 
  ],
  external: [
    'vue'
  ],
  // ...config options
});
