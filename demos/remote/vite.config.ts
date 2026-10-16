import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// 使用包依赖（dist 产物）。注意：修改 unplugin-linkjs 源码后需重新 build 才生效。
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

const linkjsVitePlugin = unpluginLinkjs.vite({
  shared,
  // 路线 B：框架生态走自适应 runtime（宿主 DEV 复用共享，宿主 PROD 用子应用自带）
  adaptiveRuntime: ['vue', 'vue-router', 'pinia'],
  // 构建期消费 remote-lib：拉取类型 + 生成 `import { HelloWorld } from 'remote-lib'` 虚拟模块。
  // 声明 `preload` 后，remote-lib 被列入构建期预加载（顶层运行时自动 preloadRemote）。
  consumeTypes: {
    dtsFile: 'src/linkjs-remotes.d.ts',
    remotes: [
      {
        name: 'remote-lib',
        host: 'http://localhost:4001',
        manifestUrl: 'http://localhost:4001/mf/manifest.json',
        preload: true,
      },
    ],
  },
  // 写入 manifest.remotes，使宿主加载 remoteApp 前按拓扑先加载 remote-lib（生产构建验证）。
  remotes: { 'remote-lib': { host: 'http://localhost:4001' } },
  // 允许 remoteApp 用 `import { HelloWorld } from 'remote-lib'`（静态 import）。
  remoteImports: { shadow: true },
});
const linkjsDevPlugins = (Array.isArray(linkjsVitePlugin) ? linkjsVitePlugin : [linkjsVitePlugin]).map((plugin) => ({
  ...plugin,
  apply: 'serve' as const,
}));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // 保留 vue()，仅用 unpluginLinkjs.vueOptions() 补充 per-app scoped id（详见 host/vite.config.ts 注释）
    vue(unpluginLinkjs.vueOptions()),
    // dev 模式下把共享依赖 import 重写为 $linkjs.loadShare，使子应用复用宿主（主应用）的实例
    ...linkjsDevPlugins,
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8081,
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
