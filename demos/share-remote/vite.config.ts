import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { unpluginLinkjs } from 'unplugin-linkjs';

// 仅声明 vue 为共享依赖：远端渲染用的 vue 会被改写成 `$linkjs.loadShare('vue')`，
// 从而复用宿主（showcase）已注册的同一份 vue 实例（避免双 Vue）。
const shared = {
  vue: { name: 'vue', lib: () => import('vue'), scope: 'global', singleton: true },
};

const linkjsPlugin = unpluginLinkjs.vite({ shared });
// 只在 dev（serve）下改写共享 import；build 直接产出自带依赖的产物。
const servePlugins = (Array.isArray(linkjsPlugin) ? linkjsPlugin : [linkjsPlugin]).map((plugin) => ({
  ...plugin,
  apply: 'serve' as const,
}));

export default defineConfig({
  plugins: [vue(unpluginLinkjs.vueOptions()), ...servePlugins],
  server: {
    port: 8091,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    },
    watch: { usePolling: true, interval: 300 },
  },
  build: { minify: false, target: 'esnext' },
});
