import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import vueDevTools from 'vite-plugin-vue-devtools';
import { linkjsSharedVersions, unpluginLinkjs } from 'unplugin-linkjs';
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // 保留 vue()，仅用 unpluginLinkjs.vueOptions() 补充 per-app 的 scoped id 作用域，
    // 避免不同应用相同相对路径的组件 scopeId 冲突（样式互相覆盖）。
    vue(unpluginLinkjs.vueOptions()),
    vueJsx(),
    vueDevTools(),
    // 注入已安装的共享依赖版本（globalThis.__LINKJS_SHARED_VERSIONS__），运行时自动补齐
    linkjsSharedVersions(),
    // 拉取远端类型并生成 declare module '<remote>/<Expose>'（dev 模式订阅 SSE 热更新）
    unpluginLinkjs.vite({
      consumeTypes: {
        // 生成到 src/ 内：被 tsconfig 的 `src/**/*` 覆盖、且 IDE(Volar/tsserver) 一定 watch，
        // 放到 node_modules 或仅靠根级 include 时 IDE 可能不刷新。
        dtsFile: 'src/linkjs-remotes.d.ts',
        remotes: [
          // 类型走 tsdown-plugin-server(4002)：会原样提供 .d.ts 并开启 mode=development + SSE，
          // 类型变更可热更新；运行时仍从 Vite 应用服务器(8081)加载入口，故用 host 覆盖。
          // preload：宿主启动自动预加载（无需在 main 手动 preloadRemote）。
          {
            name: 'remoteApp',
            manifestUrl: 'http://localhost:4002/mf/manifest.json',
            host: 'http://localhost:8081',
            preload: { manifestUrl: 'http://localhost:8081/manifest.json' },
          },
          { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json', preload: { prefetch: true } },
        ],
      },
      // 允许 `import { HelloWorld } from 'remoteApp'`（运行期解析为 createRemoteComponent 包装），
      // shadow: true 让导入的远程组件进入其影子树，与 createRemoteApp 的隔离一致。
      remoteImports: { shadow: true },
    }),
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
