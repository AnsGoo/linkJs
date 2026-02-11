import { fileURLToPath, URL } from 'node:url';

import { build, defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
// import vueDevTools from 'vite-plugin-vue-devtools';
import { viteExternalsPlugin } from 'vite-plugin-externals';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    viteExternalsPlugin({ vue: 'Vue' }),
    // vueDevTools(),
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
    outDir: 'dist',
    minify: true,
    rollupOptions: {
      output: {
        format: 'umd',
      },
    },
  },
});
