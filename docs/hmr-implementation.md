# LinkJS HMR 实现细节

> 配套文档：`docs/hmr-design.md`（分析与设计）。本篇聚焦**已落地的实现**：API、文件、数据流、配置与约束。
>
> 覆盖两条集成路线：
> - **路线 A**：组件暴露 + 共享 runtime（`useRemoteModule`）
> - **路线 B**：子应用自挂载 + 自适应 runtime（`createRemoteApp`，推荐）

---

## 1. 目标与结论

| 场景 | 路线 A | 路线 B |
| --- | --- | --- |
| 主 DEV + 子 DEV | 原生就地 HMR | 原生就地 HMR |
| 主 PROD + 子 DEV | shim 重挂载 | **原生就地 HMR** |
| 主 DEV/PROD + 子 PROD | 无（子应用无 HMR client） | 无 |

两条路线均已实现并实测：改子应用 SFC 文案 → 宿主视图就地更新、**无整页刷新**。

---

## 2. 公共机制

### 2.1 事件

`packages/linkjs/src/event-bus/constant.ts` 新增：

```ts
const REMOTE_UPDATE = 'remoteUpdate';
```

远程应用**已加载后再次 expose**（入口变化）或**组件对象被替换**时广播 `{ appName, key? }`。

### 2.2 持久 expose 监听

`packages/linkjs/src/loader/index.ts` 的 `ensureRemoteUpdates()`（首次 `loadApp`/`loadLib` 时惰性执行）：

- 调用 `setupHmrIndexing()` 建立 `hmrId → 暴露槽位` 索引；
- 监听 `LIB_EXPOSE`：若 `appName` 已在 `remoteCache`，则刷新缓存并 `emit(REMOTE_UPDATE)`；首次 expose 仍由 `loadApp`/`loadLib` 的 promise 解析逻辑处理。

`unloadRemote(appName)` 额外调用 `clearAppHmr(appName)` 清理索引。

### 2.3 hmrId 索引

`packages/linkjs/src/hmr/index.ts`：

- `indexExposedLib(appName, lib)`：扫描 `lib` 中带 `__hmrId` 的组件，记录 `{ appName, key, lib }`（`lib` 即 `remoteCache` 中同一对象）。
- `applyComponentUpdate(hmrId, resolveNew)`：替换 `lib[key]` 并 `emit(REMOTE_UPDATE)`。
- `subscribeRemoteUpdate(entry, cb): () => void`：按 `entry` 的 appName 过滤订阅。

---

## 3. API 参考

### 3.1 `linkjs` 根导出（新增/变更）

| API | 说明 |
| --- | --- |
| `subscribeRemoteUpdate(entry, cb)` | 订阅远程更新，返回退订函数 |
| `loadRuntime(name, localLoader)` | 路线 B：自适应加载框架 runtime |
| `createInstance({ mode })` | 新增 `mode?: 'development' \| 'production'`，默认自动探测 |

`createInstance` 的 `mode` 探测顺序（`packages/linkjs/src/index.ts` `detectMode`）：

1. 显式传入；
2. `import.meta.env.DEV`；
3. `process.env.NODE_ENV`；
4. 兜底 `production`。

`linkInstance.mode` 同时挂到全局 `$linkjs.loadRuntime`。

> **坑（务必注意）**：库源码里必须**直接**写 `import.meta.env`，不要用可选链 `import.meta?.env`。Vite/esbuild 的 `define` 只替换 `import.meta.env` 这个 token；写成可选链会原样进入运行时，浏览器里为 `undefined`，`mode` 落到 `production`，导致 DEV 下子应用也加载自带 Vue（第二份 runtime），覆盖全局 `__VUE_HMR_RUNTIME__`，宿主自身 HMR 失效。
> demo host 另显式传入 `mode: import.meta.env.PROD ? 'production' : 'development'` 作为兜底。

### 3.2 `linkjs/vue` 子路径

需从 `linkjs/vue` 导入（`vue` 是可选 peer）。

```ts
import { useRemoteModule, createRemoteApp } from 'linkjs/vue';
```

- `useRemoteModule(entry, options?) => ShallowRef<Component | null>`
  路线 A：宿主用 `<component :is="comp" />` 渲染。
- `createRemoteApp(entry, options?) => Component`
  路线 B：宿主渲染 `<RemoteApp />`，内部提供容器并调用子应用 `mount/unmount`。

### 3.3 `unplugin-linkjs` 选项（新增）

```ts
unpluginLinkjs({
  shared: { vue: {...}, 'vue-router': {...}, pinia: {...} },
  adaptiveRuntime: ['vue', 'vue-router', 'pinia'], // 路线 B
});
```

`adaptiveRuntime` 命中的依赖在 dev 下改写为：

```ts
await $linkjs.loadRuntime('vue', () => import('vue'))
```

> 一组耦合框架依赖必须一起列出，保证解析到**同一份** runtime。

---

## 4. 路线 A 实现细节

### 4.1 A-1 原生 HMR（主 DEV + 子 DEV）

- 删除子应用 `main.ts` 里的 `vite:beforeUpdate → location.reload()`；`vite:full-reload` 由 Vite client 默认整页刷新兜底，无需自行注册。
- 前提：**全页只有一份 Vue runtime**。宿主必须把 `vue` 生态（`pinia`/`vue-router`）也注册为共享（见 6.2）。

### 4.2 A-2 linkjs shim（主 PROD + 子 DEV）

`packages/linkjs/src/loader/app.ts:99`：`loadApp` 拿到远端 HTML 后，若 `html.includes('@vite/client')`（远端为 dev），调用 `installVueHmrRuntimeShim()`。

`packages/linkjs/src/hmr/index.ts` `installVueHmrRuntimeShim()`：

- 仅当 `globalThis.__VUE_HMR_RUNTIME__` 不存在时安装（宿主 DEV 已有真实 runtime → 跳过）；
- 提供 `createRecord`（no-op）、`rerender`（`{...current, render}`）、`reload`（替换为新组件）、`CHANGED_FILE`（可写属性，避免 plugin-vue 生成代码报错）；
- `reload/rerender` 经 `applyComponentUpdate` 更新暴露槽位并广播 `REMOTE_UPDATE`。

宿主消费（`useRemoteModule`）：订阅 `REMOTE_UPDATE` → 重新 `getRemote(entry)` 写回 `shallowRef` → `<component :is>` 重挂载。

> 该路线要求子应用把组件**暴露**给宿主（`expose('remote', { HelloWorld })`）。

---

## 5. 路线 B 实现细节（推荐）

### 5.1 集成契约：`mount / unmount`

子应用入口 `expose({ mount, unmount })`，自带 runtime 自我挂载：

```ts
// demos/remote/src/index.ts
import { expose, loadRuntime } from 'linkjs';

let app: any = null;

async function mount(el: HTMLElement, props: Record<string, any> = {}) {
  const { createApp } = await loadRuntime('vue', () => import('vue'));
  const { default: HelloWorld } = await import('./components/HelloWorld.vue');
  app = createApp(HelloWorld, props);
  app.mount(el);
}
function unmount() {
  app?.unmount();
  app = null;
}
expose('remote', { mount, unmount }, { version: '1.0.0' });
```

### 5.2 自适应 runtime `loadRuntime`

`packages/linkjs/src/runtime/index.ts`：

```ts
async function loadRuntime(name, localLoader) {
  const mode = getInstance().mode || 'production';
  if (mode !== 'production') {
    const shared = await loadShare(name);
    if (shared) return shared;
  }
  // 本地 loader 结果按 name 缓存
  ...
}
```

- 主 DEV → `loadShare` 返回共享 dev runtime（单实例，原生 HMR）。
- 主 PROD / 独立运行 → `localLoader()` 返回子应用自带 dev runtime（有 HMR runtime）。

### 5.3 unplugin 改写

`packages/unplugin-linkjs/src/index.ts`：

- `isAdaptive = adaptiveRuntime.includes(source)`；
- 命中时 `accessor = $linkjs.loadRuntime(name, () => import(name))`，并强制走 `await` 分支（`useAwait`）。

### 5.4 宿主容器 `createRemoteApp`

`packages/linkjs/src/vue.ts:54`：

- `onMounted` → `loadApp(appName)` → 调 `mod.mount(el, {...attrs})`；
- 订阅 `REMOTE_UPDATE` → `unmount` 旧实例 + 重新 `mount`（入口/expose 变化时）；
- `onUnmounted` → 退订 + `unmount`；
- 渲染 `<div ref="el">`，宿主用 `data-linkjs-scope` 包裹容器做 CSS 隔离。

### 5.5 关键约束：runtime 先于组件加载

组件若是入口的**静态导入**，会在入口模块体（含 `loadRuntime` 的 `await`）之前求值；此时真实 `__VUE_HMR_RUNTIME__` 尚未建立，plugin-vue 的 `createRecord` 落在空全局/shim 上，随后真实 runtime 的 record 为空 → HMR 静默失效。

因此**必须在 `mount` 内先 `await loadRuntime` 再动态 `import` 组件**。（在 `main.ts` 顶层 await 修复 PROD 会破坏 DEV 既有顺序，不可取。）

---

## 6. 配置指南

### 6.1 子应用

`vite.config.ts`：

```ts
const linkjsVitePlugin = unpluginLinkjs.vite({
  shared,
  adaptiveRuntime: ['vue', 'vue-router', 'pinia'], // 路线 B
});
export default defineConfig({
  plugins: [vue(), ...([linkjsVitePlugin].flat().map((p) => ({ ...p, apply: 'serve' })))],
  server: { cors: true, headers: { 'Access-Control-Allow-Origin': '*' } },
});
```

入口暴露 `mount/unmount`（见 5.1）。HMR 监听保持默认，移除任何 `vite:beforeUpdate → reload`。

### 6.2 宿主应用

```ts
const instance = createInstance({
  // mode 可省略（自动探测）；如打包器不提供 env 可显式指定
  mode: import.meta.env.PROD ? 'production' : 'development',
  shares: {
    vue: { name: 'vue', lib: () => import('vue') },
    pinia: { name: 'pinia', lib: () => import('pinia') },
    'vue-router': { name: 'vue-router', lib: () => import('vue-router') },
  },
});
```

> **必须**把框架生态一并注册为共享，否则子应用的本地回退会引入第二份 Vue，覆盖 HMR runtime。

路线 B 消费：

```vue
<script setup lang="ts">
import { createRemoteApp } from 'linkjs/vue';
const RemoteApp = createRemoteApp('remote');
</script>
<template>
  <div data-linkjs-scope="remote"><RemoteApp msg="I am remote app" /></div>
</template>
```

路线 A 消费：

```ts
import { useRemoteModule } from 'linkjs/vue';
const Comp = useRemoteModule('remote/HelloWorld');
// <component :is="Comp" msg="..." />
```

---

## 7. 数据流

```
子应用改动
  ├─ SFC 内部改动
  │    ├─ 路线 A · 主 DEV ：plugin-vue accept → 真实 __VUE_HMR_RUNTIME__ → 就地重渲染共享 runtime 实例
  │    ├─ 路线 A · 主 PROD：plugin-vue accept → linkjs shim → applyComponentUpdate → REMOTE_UPDATE
  │    │                                          → useRemoteModule.ref 更新 → 重挂载
  │    └─ 路线 B           ：plugin-vue accept → 子应用所选 dev runtime → 就地重渲染
  ├─ 入口/expose 改动 → 重新 expose → REMOTE_UPDATE → 重解析/重挂载
  └─ vite:full-reload → location.reload()
```

---

## 8. 文件清单

### packages/linkjs

- `src/event-bus/constant.ts`：`REMOTE_UPDATE`
- `src/hmr/index.ts`：索引、shim、订阅
- `src/runtime/index.ts`：`loadRuntime` / `resetRuntimeCache`
- `src/vue.ts`：`useRemoteModule` / `createRemoteApp`
- `src/loader/index.ts`：`ensureRemoteUpdates`、`subscribeRemoteUpdate` 导出、`unloadRemote` 清理
- `src/loader/app.ts`：按需安装 shim
- `src/state/instance.ts`：`mode`、`loadRuntime` 挂载到实例与 `$linkjs`
- `src/index.ts`：`createInstance({ mode })` / `detectMode` / 导出
- `tsdown.config.ts`、`package.json`：`./vue` 入口

### packages/unplugin-linkjs

- `src/index.ts`：`adaptiveRuntime` 改写
- `src/types.ts`：选项类型

### demos

- `remote/src/index.ts`：`mount/unmount` 契约
- `remote/src/main.ts`：移除 reload 监听
- `remote/vite.config.ts`：`adaptiveRuntime`
- `host/src/main.ts`：补齐共享注册
- `host/src/App.vue`：`createRemoteApp`

### 测试

- `packages/linkjs/tests/hmr.test.ts`（shim/索引/订阅）
- `packages/linkjs/tests/runtime.test.ts`（`loadRuntime`）

---

## 9. 验证

### 9.1 单测 / 静态检查

```bash
pnpm --filter linkjs exec vitest run       # 47 用例
pnpm --filter unplugin-linkjs exec vitest run  # 17 用例
pnpm typecheck
pnpm lint
pnpm build
```

### 9.2 浏览器实测（Playwright + CDP）

```bash
# 主 DEV + 子 DEV
pnpm --dir demos/remote exec vite --port 8081
pnpm --dir demos/host exec vite --port 5173

# 主 PROD + 子 DEV
pnpm build && pnpm --dir demos/runtime-registry exec tsdown
pnpm --dir demos/host exec vite build
pnpm --dir demos/host exec vite preview --port 8090
```

探针：加载宿主 → 记录导航次数 → 改 `HelloWorld.vue` → 断言文本更新且无整页刷新。实测两场景均通过；路线 B 主 PROD 下 `__VUE_HMR_RUNTIME__.rerender` 被真实 runtime 调用（非 shim）。

---

## 10. 兼容性与迁移

- 路线 A 与 B 可并存；`useRemoteModule` 与 `createRemoteApp` 独立。
- 从 A 迁移到 B：
  1. 子应用入口由 `expose({ Component })` 改为 `expose({ mount, unmount })`（`mount` 内先 `loadRuntime` 再动态导入组件）；
  2. 子应用 `vite.config.ts` 加 `adaptiveRuntime`；
  3. 宿主由 `<component :is>` 改为 `<RemoteApp />`。
- 非 Vue 子应用不受 `linkjs/vue` 影响；`subscribeRemoteUpdate`/`loadRuntime` 为框架无关能力。

---

## 11. 已知限制

- shim（路线 A 主 PROD）依赖 plugin-vue 生成的裸全局 `__VUE_HMR_RUNTIME__` 出口，plugin-vue 主版本升级需回归。
- 路线 B 目前由入口手动保证"runtime 先于组件加载"。可考虑由 unplugin 自动生成虚拟入口来消除样板代码。
- 跨 runtime（路线 B 主 PROD）props 为快照传入，动态双向更新需 `update()` 或事件总线。
- `loadRuntime` 本地缓存按 `name`，当前不做卸载清理（runtime 为应用级）。

---

## 12. 部署组合与联调场景

HMR 只可能发生在**处于 Vite dev 模式**的一侧；已部署的静态产物没有 HMR client 与 dev runtime，改其源码不会反映到运行中的页面（需重新构建/部署）。

### 12.1 四组合矩阵

| 宿主 | 子应用 | 改**宿主**源码 | 改**子应用**源码 |
| --- | --- | --- | --- |
| DEV | DEV | ✅ 就地更新 | ✅ 就地更新 |
| DEV | PROD（已部署） | ✅ 就地更新 | ❌（静态产物，需重建） |
| PROD（静态） | DEV | ❌（静态产物，需重建） | ✅ 就地更新（本地联调线上） |
| PROD | PROD | ❌ | ❌ |

> 想联调哪个应用，就让**它**跑本地 Vite dev，另一个用已部署/静态版本即可。

### 12.2 各组合的实现路径

- **主 DEV + 子 DEV**：单共享 dev runtime，原生 HMR（双方）。
- **主 DEV + 子 PROD**：子应用构建产物里 `from 'vue'` 已被 unplugin（build）改写为 `$linkjs.getShare('vue')`，复用宿主 dev runtime → 宿主单 runtime，宿主 HMR 正常；子应用不可 HMR。
- **主 PROD + 子 DEV**（本地联调线上）：路线 B，子应用自带 dev runtime 自挂载 → 子应用原生就地 HMR；宿主静态不可 HMR。
- **主 PROD + 子 PROD**：无 HMR。

### 12.3 用 override 切换"dev 子应用 ↔ 已部署子应用"

demo 的 `overrideRemote()` 读取 `localStorage['__linkjs_overrides__']`，格式 `{ [remoteName]: 'https://host' }`，会在加载时用该 host 的 `manifest.json` 覆盖 remote 配置。因此**无需改代码**即可切换：

```js
// 切到本地 dev 子应用（联调）
localStorage.setItem('__linkjs_overrides__', JSON.stringify({ remote: 'http://localhost:8081' }));
// 切回已部署子应用
localStorage.setItem('__linkjs_overrides__', JSON.stringify({ remote: 'https://your-cdn.example.com' }));
```

前提：dev server 需开启 CORS（remote `vite.config.ts` 已配 `Access-Control-Allow-Origin: *`）；被加载的 dev 站点 HTML 需包含 Vite client（用于 HMR）。

### 12.4 静态宿主 + 本地 dev 子应用（实测）

- 进程：`demos/host/dist` 由静态服务器托管（模拟线上），`demos/remote` 跑 `vite --port 8081`。
- 结果：改 `demos/remote/src/components/HelloWorld.vue` → 宿主页面就地更新、无整页刷新（`nav` 不变）。
