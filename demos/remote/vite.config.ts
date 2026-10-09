import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { unpluginLinkjs, unpluginLinkjsRollowPlugin } from 'unplugin-linkjs';

const shared = {
  vue: {
    name: 'vue',
    lib: () => import('vue'),
    scope: 'global',
    singleton: true,
  },
  'vue-router': {
    name: 'vue-router',
    lib: () => import('vue-router'),
    scope: 'global',
    singleton: true,
  },
  pinia: {
    name: 'pinia',
    lib: () => import('pinia'),
    scope: 'global',
    singleton: true,
  },
};

const linkjsVitePlugin = unpluginLinkjs.vite({ shared });
const linkjsDevPlugins = (Array.isArray(linkjsVitePlugin) ? linkjsVitePlugin : [linkjsVitePlugin]).map(
  (plugin) => ({ ...plugin, apply: 'serve' as const }),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 跨子应用唯一化 scoped id（详见 host/vite.config.ts 注释）
      features: {
        componentIdGenerator: (normalizedPath: string, _source: string, _isProd: boolean, getHash: (t: string) => string) =>
          getHash(`${normalizedPath}:remote`),
      },
    }),
    // dev 模式下把共享依赖 import 重写为 $linkjs.loadShare，使子应用复用宿主（主应用）的实例
    ...linkjsDevPlugins,
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8080,
    watch: {
      usePolling: true,
      interval: 300,
    },
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
      plugins: [unpluginLinkjsRollowPlugin({ shared })],
    },
  },
});
