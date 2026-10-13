# 快速开始

本页用一个最小的 **Vue 3 + Vite** 组合说明如何接入 LinkJS。完整可运行版本见仓库 `demos/`。

## 前提

- Node.js `^20.19.0 || >=22.12.0`
- Vite 7+（本仓库示例用 Vite 8 beta）
- Vue 3（示例；核心运行时与框架无关）

## 1. 安装

```bash
pnpm add linkjs unplugin-linkjs
```

## 2. 远程：暴露组件

远程入口用 `expose(name, module)` 暴露给宿主：

```ts
// remote/src/index.ts
import { createApp } from 'vue';
import { expose } from 'linkjs';
import HelloWorld from './components/HelloWorld.vue';

let app: ReturnType<typeof createApp> | null = null;

function mount(el: HTMLElement, props: Record<string, unknown> = {}) {
  app = createApp(HelloWorld, props);
  app.mount(el);
}
function unmount() {
  app?.unmount();
  app = null;
}

// 同时暴露 HelloWorld 组件（供宿主 import / getRemote 消费）
expose('remoteApp', { mount, unmount, HelloWorld });
```

远程构建配置里注册共享依赖（让远程复用宿主的 Vue 实例）：

```ts
// remote/vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { unpluginLinkjs } from 'unplugin-linkjs';

const shared = {
  vue: { name: 'vue', lib: () => import('vue'), scope: 'global', singleton: true },
};

export default defineConfig({
  plugins: [
    vue(unpluginLinkjs.vueOptions()),
    // dev 下把共享依赖 import 重写为 $linkjs.loadShare，复用宿主实例
    ...unpluginLinkjs.vite({ shared, adaptiveRuntime: ['vue'] }),
  ],
  server: { port: 8081, cors: true, headers: { 'Access-Control-Allow-Origin': '*' } },
});
```

## 3. 宿主：加载远程

```ts
// host/vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { linkjsSharedVersions, unpluginLinkjs } from 'unplugin-linkjs';

export default defineConfig({
  plugins: [
    vue(unpluginLinkjs.vueOptions()),
    linkjsSharedVersions(), // 注入已安装共享依赖版本
    unpluginLinkjs.vite({
      consumeTypes: {
        remotes: [
          { name: 'remoteApp', manifestUrl: 'http://localhost:8081/mf/manifest.json', preload: true },
        ],
      },
      remoteImports: { shadow: true },
    }),
  ],
});
```

```ts
// host/src/main.ts
import { createInstance } from 'linkjs';

createInstance({
  shares: { vue: { name: 'vue', lib: () => import('vue') } },
});
```

## 4. 使用远程组件

路线 B（子应用自挂载，推荐用于完整应用）：

```vue
<script setup lang="ts">
import { createRemoteApp } from 'linkjs/vue';
const RemoteApp = createRemoteApp('remoteApp', { shadow: true });
</script>
<template>
  <RemoteApp msg="hi" />
</template>
```

路线 A（构建期 import，仅对声明了 `preload` 的远程）：

```ts
import { HelloWorld as RemoteHelloWorld } from 'remoteApp';
```

更多方式见 [集成模式](/guide/integration-modes)。

## 5. 跑起来

```bash
pnpm --filter vue-components-starter dev   # remote-lib  :4001
pnpm --filter RemoteApp dev                # remoteApp   :8081（类型服务 :4002）
pnpm dev:showcase                          # 示例集      :5190
```

打开 http://localhost:5190 ：宿主示例集内置「一个场景一页」——
总览 / 运行时加载 / 构建期 import / 依赖拓扑 / 路由级预取 / 多源灰度 / Shadow 隔离 / 插件机制 / 类型转发 / HMR / 可观测。
