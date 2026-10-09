import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import vueDevTools from 'vite-plugin-vue-devtools';
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 跨子应用唯一化 scoped id：plugin-vue dev 默认只 hash 相对路径，
      // 不同应用相同路径的组件会得到相同 scopeId 导致样式互相覆盖。
      features: {
        componentIdGenerator: (normalizedPath: string, _source: string, _isProd: boolean, getHash: (t: string) => string) =>
          getHash(`${normalizedPath}:host`),
      },
    }),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  build: {
    minify: false,
  },
});
