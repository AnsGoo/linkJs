import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { linkjsSharedVersions, unpluginLinkjs } from 'unplugin-linkjs';

// LinkJS 精美示例集：宿主 + 运行时消费 + 构建期消费（static import）+ 预加载。
export default defineConfig({
  plugins: [
    vue(unpluginLinkjs.vueOptions()),
    // 注入共享依赖版本（globalThis.__LINKJS_SHARED_VERSIONS__）
    linkjsSharedVersions(),
    unpluginLinkjs.vite({
      consumeTypes: {
        dtsFile: 'src/linkjs-remotes.d.ts',
        remotes: [
          {
            name: 'remoteApp',
            manifestUrl: 'http://localhost:4002/mf/manifest.json',
            host: 'http://localhost:8081',
            preload: { manifestUrl: 'http://localhost:8081/manifest.json' },
          },
          { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json', preload: { prefetch: true } },
        ],
      },
      // `import { HelloWorld } from 'remoteApp'` / `'remote-lib'`
      remoteImports: { shadow: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5190,
    cors: true,
    watch: { usePolling: true, interval: 300 },
  },
  build: { minify: false },
});
