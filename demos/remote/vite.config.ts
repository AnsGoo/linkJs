import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    unpluginLinkjsRollowPlugin({
      shared: {
        vue: {
          lib: () => import('vue'),
          scope: 'global',
          singleton: true,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8080,
    /** 跨域设置允许 */
    cors: true,
    /** 开启跨域，方便本机上别的项目调试当前模块 */
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    },
  },
  build: {
    cssCodeSplit: false,
    outDir: 'dist',
    rolldownOptions: {
      external: ['vue'],
      plugins: [],
    },
  },
});
