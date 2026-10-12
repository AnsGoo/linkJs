import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import vueDevTools from 'vite-plugin-vue-devtools';
import { linkjsSharedVersions, unpluginLinkjs } from 'unplugin-linkjs';
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
          { name: 'remoteApp', manifestUrl: 'http://localhost:4002/mf/manifest.json', host: 'http://localhost:8081' },
          { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json' },
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
