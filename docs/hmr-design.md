# LinkJS 子应用 HMR 免刷新方案（P6）分析与设计

> 目标：在「主应用 DEV + 子应用 DEV」「主应用 PROD + 子应用 DEV」两种场景下，修改子应用代码都能**免整页刷新**地反映到宿主页面，同时保留宿主自身的 router / pinia / 全局状态。
>
> 本文是 P6「远期：无刷新 HMR（宿主响应式重解析 expose）」的分析过程与实现思路，对应 `docs/development-plan.md` P6 条目。
>
> 全文分两大部分：
> - **集成模型**：路线 A（组件暴露 + 共享 runtime）、路线 B（自挂载 + 自适应 runtime）。
> - **实现手段**：原生 Vue HMR、linkjs shim、自适应 runtime。

---

## 1. 现状

### 1.1 当前 dev 行为

子应用被宿主加载时（`demos/remote/src/main.ts:8`），会注册一个 Vite HMR 监听，任何更新都直接刷新整个宿主页面：

```ts
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    location.reload(); // 粗暴方案：任何子应用改动都刷新宿主
  });
}
```

宿主消费远端组件用的是「一次性异步组件」（`demos/host/src/App.vue:6`）：

```ts
const RemoteComponent = defineAsyncComponent(async () => {
  const remote = await getRemote('remote/HelloWorld');
  return remote;
});
```

`getRemote` 只在加载时取一次，之后子应用再 `expose` 宿主不会响应。

### 1.2 加载链路

`loadApp`（`packages/linkjs/src/loader/app.ts`）：

1. `await Promise.all(preload.map(loadShare))` —— 先预加载共享依赖（第 80 行）。
2. `fetchHtml(htmlUrl)` 拿到远端 HTML，`DOMParser` 解析出 `link[rel=stylesheet]` / `link[rel=modulepreload]` / `script[src]`。
3. 逐个 `loadScript`（`loader/utils.ts:55`）以 `<script type="module">` 注入远端入口。
4. 通过事件总线等子应用触发 `LIB_EXPOSE`，把暴露对象写入 `remoteCache`（`loader/utils.ts:137`），随后立即 `off`。

`loadScript` 对 URL 含 `@vite/client` 的 script 标签直接 `resolve()`（`loader/utils.ts:57`），但这**不影响**远端 HMR client 的加载：Vite 会在被转换模块顶部注入真实 ESM `import "/@vite/client"`，浏览器会从远端 origin 拉取，从而与远端 dev server 建立 WebSocket。

结论：**"子应用 HMR client 已连接远端 dev server" 这条链路本来就是通的**，只是当前被用来触发整页刷新。

---

## 2. 场景矩阵

| 场景 | 共享 Vue 来源 | `__VUE_HMR_RUNTIME__` | 原生 Vue HMR |
| --- | --- | --- | --- |
| 主 DEV + 子 DEV | 主应用 dev vue | 存在 | ✅ 就地更新 |
| 主 PROD + 子 DEV | 主应用 prod vue | **不存在** | ❌ 报错 |
| 主 DEV + 子 PROD | — | 子应用无 client | ❌ |
| 主 PROD + 子 PROD | — | — | ❌ |

只有「主 DEV + 子 DEV」能靠原生 Vue HMR；「主 PROD + 子 DEV」需要额外机制。

为什么共享的是**主应用**的 vue：`unplugin-linkjs` 在 dev 下把子应用的 `from 'vue'` 改写为 `$linkjs.loadShare('vue')`（`packages/unplugin-linkjs/src/index.ts:124`），`registerShare` 单例模式下主应用先注册者胜出，因此子应用拿到的是主应用那个 vue 实例。

---

## 3. 根因分析（为什么两场景不同）

### 3.1 Vue HMR runtime 只有 dev 才存在

`@vue/runtime-core` 仅在非生产环境创建全局 HMR runtime：

```
node_modules/.pnpm/@vue+runtime-core@3.5.43/.../runtime-core.esm-bundler.js:463
if (!!(process.env.NODE_ENV !== "production")) {
  getGlobalThis().__VUE_HMR_RUNTIME__ = {
    createRecord, rerender, reload
  };
}
```

主应用为 PROD 时，其 vue 是 prod build，**从不设置这个全局**。

### 3.2 plugin-vue 生成的代码并非全部有 `typeof` 保护

`@vitejs/plugin-vue@6.0.9`（demo 实际使用版本）生成：

```
.../plugin-vue/dist/index.mjs:1389  typeof __VUE_HMR_RUNTIME__ !== 'undefined' && __VUE_HMR_RUNTIME__.createRecord(...)   // 有保护
.../plugin-vue/dist/index.mjs:1390  import.meta.hot.on('file-changed', () => { __VUE_HMR_RUNTIME__.CHANGED_FILE = file }) // 回调无保护
.../plugin-vue/dist/index.mjs:1391  export const _rerender_only = __VUE_HMR_RUNTIME__.CHANGED_FILE === ...                 // 顶层无保护
.../plugin-vue/dist/index.mjs:1392  import.meta.hot.accept(mod => { ... __VUE_HMR_RUNTIME__.reload(...) })                // 无保护
```

因此「主 PROD + 子 DEV」下：

- 仅改模板 → 第 1391 行顶层引用未定义全局 → **模块求值直接抛错**；
- 改脚本 → 第 1392 行 accept 回调抛错。

即原生 HMR 不仅"不生效"，反而会报错。

### 3.3 主 DEV + 子 DEV 为什么能工作

- 主应用 dev vue 建立真实 `__VUE_HMR_RUNTIME__`；
- 主应用已挂载的实例注册在**同一个** runtime 的 `map` 里（`registerHMR`）；
- 子应用 SFC 的 accept 回调调用全局 `reload(hmrId, newComp)`，就地重渲染宿主实例。

所以当前"必须刷新"的结论，很可能是被 `vite:beforeUpdate` 这个无脑 reload 监听器**自己制造**的假象——`:beforeUpdate` 对已被 accept 的更新同样会触发。

### 3.4 两个可复用的关键洞察

1. 子应用模块**运行在宿主页面同一个 realm**：`$linkjs`、事件总线、`globalThis` 全部共享；插件生成的 accept 回调会把**新组件对象**递出来。因此可以不依赖真实 Vue HMR runtime，自己接管更新出口。
2. `__VUE_HMR_RUNTIME__` 是**全局单例**（见 3.1），一页里若存在多份 dev vue，就会互相覆盖，这是路线 B 必须处理的硬约束（详见 7.2）。

---

## 4. 设计目标与原则

- 两种场景都要免刷新。
- 不引入 iframe / worker。
- 主 DEV 场景尽量保留原生 HMR 的"就地更新、保留组件内部状态"优势。
- 行为变更同步更新本文件与 `development-plan.md`。

---

## 5. 两种集成模型

| | 路线 A：组件暴露 + 共享 runtime | 路线 B：自挂载 + 自适应 runtime |
| --- | --- | --- |
| 契约 | 子应用 `expose` 出 SFC 组件，宿主用自己的 runtime 渲染 | 子应用 `expose` 出 `mount/unmount`，自带 runtime 自己渲染 |
| 框架 runtime | 始终共享主应用 vue | 主 DEV 共享；主 PROD 用子应用自有 vue |
| 主 DEV 免刷新 | 原生 HMR | 原生 HMR |
| 主 PROD 免刷新 | 靠 shim 重挂载 | 原生 HMR |
| 跨应用 props/响应式 | 宿主 runtime 直传，天然响应 | 跨 runtime，需 props 快照 / `update()` / 事件桥 |
| pinia/router 所有权 | 可共享（P3 待定） | 每应用自持，天然解决 |
| framework 体积 | 共享一份 | 主 PROD 时多一份 |
| 改动量 | 小 | 大（改契约 + unplugin + demo） |

两条路线都把「检测」交给 dev 应用（谁 dev 谁收 HMR 事件），差别在「应用/渲染」由谁承担：

- 路线 A 的渲染由宿主 runtime 承担 → 主 PROD 时宿主 runtime 无 HMR，只能用 shim 重挂载。
- 路线 B 的渲染由子应用自己的 runtime 承担 → 只要保证子应用 dev 时拿到一份带 HMR 的 runtime，就恒为原生 HMR。

推荐以**路线 B 为目标架构**（隔离清晰、HMR 恒可用），路线 A 作为快速可用/过渡方案。

---

## 6. 路线 A 实现（组件暴露 + 共享 runtime）

### 6.1 手段一：原生 Vue HMR（主 DEV + 子 DEV）

实测结论：**无需任何注入**，只要移除子应用里的无脑 reload 监听即可。

1. 删除子应用 `main.ts` 里的 `vite:beforeUpdate → location.reload()`。Vite client 对 `vite:full-reload` 本来就默认整页刷新，因此无需自己注册兜底。
2. 前置条件（关键）：**全页只能有一份 Vue runtime**。宿主必须把 `vue` 生态（`pinia` / `vue-router`）也注册为共享；否则子应用 `register-shares` 的本地回退会从子应用 origin 加载第二份 Vue，覆盖全局 `__VUE_HMR_RUNTIME__`，HMR 静默失效（见 13. 实测记录）。

依赖前提：`loadApp` 的 `preload` 会先 `loadShare('vue')`，从而先求值主应用 dev vue，建立真实 `__VUE_HMR_RUNTIME__`，宿主实例同 runtime 注册。

### 6.2 手段二：linkjs shim（主 PROD + 子 DEV）

**安装时机**：`loadApp` 在 `await preload(shared)`（`loader/app.ts:80`）之后：

```ts
if (typeof globalThis.__VUE_HMR_RUNTIME__ === 'undefined') {
  installVueHmrRuntimeShim(); // 主应用 PROD 场景
}
```

主 DEV 时 preload 已让真实 runtime 建立全局 → 跳过 shim。

**shim 接口**：

```ts
interface VueHmrRuntime {
  createRecord(id: string, comp: any): boolean;
  rerender(id: string, render: Function): void;
  reload(id: string, newComp: any): void;
  CHANGED_FILE?: string;
}
```

- `createRecord(id, comp)`：`records.set(id, { comp })`。
- `reload(id, newComp)`：找到映射到 `id` 的所有暴露槽位，替换为 `newComp`，emit `REMOTE_UPDATE(appName)`。
- `rerender(id, render)`：取旧组件，克隆并替换 `render`，走同样的更新。
- `CHANGED_FILE`：定义为可写属性（避免 3.2 中 1390/1391 行抛错）。

**hmrId → 暴露槽映射**：`expose` 时扫描 `lib` 中带 `__hmrId` 的组件，建立 `hmrId → (appName, key)`；各 demo 已用 `componentIdGenerator` 按应用加盐，跨应用 `hmrId` 唯一。

**宿主消费**：核心提供框架无关的 `subscribeRemoteUpdate(entry, cb)`；`linkjs/vue` 提供

```ts
const RemoteComponent = useRemoteModule('remote/HelloWorld');
// <component :is="RemoteComponent" msg="..." />
```

`shallowRef` + 订阅，组件对象被替换 → Vue 自动重挂载，**prod runtime 也跑得通**。

**入口变化**：远端入口对 `./index.ts` 注册 `import.meta.hot.accept`，变更时重跑 `expose()`，走同一链路。

**兜底**：`vite:full-reload` → 整页刷新。

---

## 7. 路线 B 实现（自挂载 + 自适应 runtime）

### 7.1 核心：mount / unmount 契约

把集成契约从"暴露组件"改为"暴露挂载能力，子应用自带 runtime 自己渲染"：

```ts
// 子应用（hosted 时）
import { createApp } from 'vue'          // 由自适应 loader 决定共享 or 本地
import App from './App.vue'

let app: App<Element> | null = null

export function mount(el: HTMLElement, props?: Record<string, any>) {
  app = createApp(App, props)
  app.use(myPinia).use(myRouter)         // 子应用自持生态
  app.mount(el)
}
export function update(props: Record<string, any>) { /* 可选：跨 runtime 传参 */ }
export function unmount() { app?.unmount(); app = null }

expose('remote', { mount, update, unmount }, { version: '1.0.0' })
```

宿主只提供一个容器节点，用自己的 runtime 渲染这个 `<div>`；子应用在**自己的 runtime** 里往该节点挂载。两个 Vue 实例通过 DOM 边界隔开，互不渲染对方组件。

### 7.2 硬约束：`__VUE_HMR_RUNTIME__` 全局冲突

`__VUE_HMR_RUNTIME__` 是全局单例（3.1），plugin-vue 以裸全局引用调用（3.2）。若主、子各自 bundle 了 dev vue：

- 两个 dev vue 都会写该全局，**后加载者覆盖先加载者**；
- 被覆盖一方 app 的 SFC accept 回调会调到"别人的" runtime，其 `map` 中没有本 app 的实例 → HMR 静默失效。

冲突只发生在**两个都 dev**：

| 场景 | 子应用用自有 dev vue 是否冲突 | 结论 |
| --- | --- | --- |
| 主 PROD + 子 DEV | 否（主 prod vue 不写全局） | 路线 B 天然可行 |
| 主 DEV + 子 DEV | 是（两个 dev vue 抢全局） | 需自适应策略：复用共享 dev vue |

即：路线 B 的痛点恰好只在"两个都 dev"，而该场景下复用共享 runtime 本就无冲突。由此引出 7.3。

### 7.3 自适应 runtime（share-or-local）

用一个**运行时判断**决定子应用用哪份框架 runtime：

- 主应用 dev → 子应用**复用共享的 dev vue**（单 runtime，无冲突，native HMR）；
- 主应用 prod → 子应用**回退到自有 dev vue**（隔离，无冲突，native HMR）。

于是无论主应用模式如何，子应用 dev 时都持有一份**带 HMR 的 runtime**，原生 HMR 恒成立。

实现要点：

1. **主应用 mode 标识**：`createInstance` 时把自身模式（`import.meta.env.PROD` 编译期常量）写入实例；子应用经 `$linkjs` 读取。**不要**用"全局 `__VUE_HMR_RUNTIME__` 是否存在"判断——它是可变的、会竞态（子应用本地 vue 加载后同样会置位）。
2. **unplugin dev 改写**：框架类依赖改写为自适应加载：
   ```ts
   const vue = await $linkjs.loadRuntime('vue', () => import('vue'))
   ```
   `loadRuntime(name, localLoader)`：主 dev → 返回共享实例；主 prod → 执行 `localLoader` 返回子应用自己的 dev vue。结果按 (app, name) **缓存**，保证同一应用内一致。
3. **框架生态必须同源**：`vue` / `vue-router` / `pinia` 必须解析到**同一份** runtime，否则 pinia 内部 `from 'vue'` 会指向另一实例。需把这一组作为"隔离组"整体决策——这是本路线最大的实现风险点。
4. **本地 loader 的解析**：`() => import('vue')` 需要由 Vite 正常解析到子应用本地依赖；注意避免被同一插件的改写逻辑二次处理（用标记/虚拟模块保护）。

### 7.4 宿主适配组件（`linkjs/vue`）

```ts
const RemoteApp = createRemoteApp('remote', { sandbox: true })
```

内部：

```ts
setup() {
  const el = ref<HTMLElement>()
  let mod: { mount: Function; unmount: Function } | null = null
  onMounted(async () => {
    mod = await loadApp(entry, options)
    mod.mount(el.value!, attrsSnapshot)
  })
  onUnmounted(() => mod?.unmount())
  return () => h('div', { ref: el, 'data-linkjs-scope': appScope })
}
```

宿主模板里直接：

```html
<div data-linkjs-scope="remote"><RemoteApp /></div>
```

### 7.5 HMR 流（路线 B）

- **组件内部改动**：子应用所选 runtime（共享 dev 或本地 dev）正常 accept → 就地重渲染子应用实例，**保留子应用组件状态**。
- **入口/expose 改动**：子应用入口对 `./index.ts` 注册 accept，重跑 `expose` → 宿主订阅 `REMOTE_UPDATE` → `unmount` 旧实例 + `mount` 新实例。
- **`vite:full-reload`**：整页刷新兜底。

### 7.6 共享 / 隔离与状态所有权

- 框架组（`vue` + 其生态）按 7.3 自适应。
- 其余纯工具依赖（lodash 等）仍走 `loadShare` 共享。
- pinia / vue-router 由各应用自持，天然回答 P3 的"所有权约定"；跨应用通信走 linkjs 事件总线。
- 主 PROD 场景下会重复一份框架体积，作为隔离的代价。

### 7.7 CSS 与跨 runtime 通信

- CSS 继续用 `data-linkjs-scope` 包裹；路线 B 下可进一步选配 Shadow DOM 提升隔离性。
- 宿主 → 子应用：初始 props 由 `mount` 快照传入；动态更新用 `update(props)` 或事件。
- 子应用 → 宿主：linkjs 事件总线 / 回调 props。

---

## 8. 事件与数据流

```
子应用改动
  ├─ SFC 内部改动
  │    ├─ 路线 A · 主 DEV ：plugin-vue accept → 真实 __VUE_HMR_RUNTIME__.reload → 宿主实例就地重渲染
  │    ├─ 路线 A · 主 PROD：plugin-vue accept → shim.reload → 更新 remoteCache + emit REMOTE_UPDATE
  │    │                                              → useRemoteModule.ref 更新 → 重挂载
  │    └─ 路线 B           ：plugin-vue accept → 子应用自身 dev runtime → 就地重渲染子应用实例
  ├─ 入口/expose 改动 → 入口 accept('./index.ts') → 重跑 expose → emit REMOTE_UPDATE → 重解析/重挂载
  └─ vite:full-reload → location.reload()
```

事件总线新增常量：`REMOTE_UPDATE`（`packages/linkjs/src/event-bus/constant.ts`）。

---

## 9. 文件级改动清单

### packages/linkjs

- `src/event-bus/constant.ts`：新增 `REMOTE_UPDATE`。
- `src/hmr/runtime.ts`（新，路线 A）：shim 安装、`records`、`reload/rerender`、暴露槽映射。
- `src/runtime/index.ts`（新，路线 B）：`loadRuntime(name, localLoader)`、隔离组策略、结果缓存。
- `src/state/instance.ts`：`createInstance` 记录主应用 mode；`linkInstance` 暴露 mode 与 `loadRuntime`。
- `src/loader/app.ts`：路线 A —— preload 后决定装 shim；路线 B —— 透传/初始化 runtime 策略。
- `src/loader/utils.ts`：`expose` 持久化、`hmrId` 映射、`REMOTE_UPDATE` 派发。
- `src/loader/index.ts`：导出 `subscribeRemoteUpdate`；`unloadRemote` 清理映射/records/订阅。
- `src/index.ts` + `package.json` exports：`linkjs/vue` 导出 `useRemoteModule`（路线 A）、`createRemoteApp`（路线 B）。

### packages/unplugin-linkjs

- 框架依赖改写为 `$linkjs.loadRuntime(...)`（路线 B，新增 `isolateFramework` / 隔离组选项）。
- dev 注入：`vite:full-reload` 兜底、入口 `accept('./index.ts')`。

### demos

- 路线 A：`demos/host/src/App.vue` 用 `useRemoteModule` + `<component :is>`；`demos/remote/src/main.ts` 移除手动 reload。
- 路线 B：`demos/remote/src/main.ts` 改为 `mount/unmount` 契约；`demos/host` 用 `createRemoteApp` 容器。

---

## 10. 边界与风险

- 路线 A·主 PROD 是**重挂载**：组件内部局部状态丢失；宿主 router/pinia/全局状态保留。
- 路线 B 跨 runtime：props 非自动响应，需快照/`update()`/事件桥；主 PROD 多一份 framework 体积。
- 路线 B **框架生态必须同源**（7.3 第 3 点），否则 pinia/router 会串到另一个 vue 实例。
- 路线 B 的自适应判断必须用"主应用 mode 标识"，不能用全局 `__VUE_HMR_RUNTIME__` 是否存在（竞态）。
- 仅支持 Vue；React 等需另做适配（事件/ref 机制通用，shim/自适应为 Vue 专用）。
- 路线 A 若主 PROD 场景 `preload` 未包含 vue，可能误装 shim；需保证共享 vue 在 `preload` 声明。
- `unloadRemote` 需清理 `hmrId` 映射、shim records、订阅与路线 B 的 runtime 缓存，避免泄漏。
- SSR 需 `typeof globalThis` 保护。

---

## 11. 落地步骤

**推荐：先落地路线 A（快速可用），再迁移路线 B（目标架构）。**

1. **A-1**：回退条件改为仅 `vite:full-reload`，跑通主 DEV 原生 HMR。
2. **A-2**：实现 shim + `subscribeRemoteUpdate` + `useRemoteModule`，跑通主 PROD 免刷新。
3. **B-1**：定义 `mount` 契约 + 主应用 mode 标识 + `loadRuntime`，跑通"主子都 dev（共享）"与"主 prod 子 dev（本地）"。
4. **B-2**：`createRemoteApp` 容器组件 + `REMOTE_UPDATE` 重挂载，demo 迁移。
5. **B-3**：隔离组（vue 生态同源）校验、`unloadRemote` 清理、单测 + e2e。
6. 更新 `docs/development-plan.md` P6 状态。

---

## 12. 测试计划

- 单测（`packages/linkjs`）：
  - 路线 A：无 `__VUE_HMR_RUNTIME__` 时装 shim；`createRecord`/`reload`/`rerender` 更新 `remoteCache` 并 emit `REMOTE_UPDATE`；`subscribeRemoteUpdate` 订阅/退订；`unloadRemote` 清理。
  - 路线 B：`loadRuntime` 在主 dev 返回共享、主 prod 返回本地；隔离组同源；缓存生效。
- demo e2e（Playwright）：
  - 主 DEV + 子 DEV：改 SFC 文案 → 就地更新、页面未刷新（宿主计数器/路由状态验证）。
  - 主 PROD + 子 DEV：路线 A → 重挂载更新；路线 B → 就地更新；均不刷新页面。

---

## 13. 实测记录（路线 A 已实现）

### 13.1 关键根因修正

原假设「共享 Vue 单例下原生 SFC HMR 必然可用」在 demo 中被实测推翻。用 Playwright + CDP 定位得到真实根因：

- 改远程 `HelloWorld.vue` 后，远端 client 收到 `[vite] hot updated`，但宿主文本不变、无刷新。
- 排查发现全局 `__VUE_HMR_RUNTIME__` 的 records 中**没有**该组件的 `hmrId`（`createRecord` 探测返回 true）。
- 网络/CDP initiator 显示：远端 origin 额外加载了一份 `vue.runtime.esm-bundler-*.js`，来源是 `loadModule @ share/index.ts`，即 `loadShare('pinia')` / `loadShare('vue-router')` 触发了子应用 `register-shares` 的**本地回退**（宿主当时只注册了 `vue`），从而把**第二份 Vue** 拉进页面，覆盖了全局 HMR runtime。

结论：**全页只能有一份 Vue runtime**。宿主缺失 `pinia`/`vue-router` 共享注册时，任何触发这两个依赖加载的行为都会引入第二份 Vue，使 HMR 静默失效。

### 13.2 改动

- `demos/remote/src/main.ts`：删除 `vite:beforeUpdate → location.reload` 监听。
- `demos/host/src/main.ts`：`createInstance` 的 `shares` 补齐 `pinia`/`vue-router`（与 `vue` 同源共享）。
- `packages/linkjs/src/hmr/index.ts`（新）：
  - `indexExposedLib`：建立 `hmrId → (appName, key)` 映射（同 `remoteCache` 中的 lib 对象引用）。
  - `installVueHmrRuntimeShim`：仅当全局无真实 runtime 时安装，`reload/rerender` 替换暴露槽位并 emit `REMOTE_UPDATE`。
  - `applyComponentUpdate` / `clearAppHmr` / `subscribeRemoteUpdate`。
- `packages/linkjs/src/loader/index.ts`：`ensureRemoteUpdates()` 惰性注册持久 `LIB_EXPOSE` 监听——已在缓存中的 appName 再次 expose 视为更新，刷新缓存并广播 `REMOTE_UPDATE`；`unloadRemote` 调 `clearAppHmr`。
- `packages/linkjs/src/loader/app.ts`：`fetchHtml` 后若远端 HTML 含 `@vite/client`，尝试 `installVueHmrRuntimeShim()`（宿主 DEV 已存在真实 runtime 时不安装）。
- `packages/linkjs/src/event-bus/constant.ts`：新增 `REMOTE_UPDATE`。
- `packages/linkjs/src/vue.ts`（新，`linkjs/vue` 子路径）：`useRemoteModule(entry, options)` → `ShallowRef<Component>`，订阅 `REMOTE_UPDATE` 自动重解析。
- `packages/linkjs/tsdown.config.ts` / `package.json`：新增 `./vue` 入口与 exports；`vue` 为可选 peer。
- `demos/host/src/App.vue`：远程组件改用 `useRemoteModule` + `<component :is>`。
- 单测：`packages/linkjs/tests/hmr.test.ts`（5 例）。

### 13.3 实测结果（Playwright）

| 场景 | 加载方式 | 结果 |
| --- | --- | --- |
| 主 DEV + 子 DEV | host dev `:5173` + remote dev `:8081` | 改 SFC 文案 → 就地更新，`nav 3→3`（无刷新） |
| 主 PROD + 子 DEV | host 生产构建 + `vite preview :8090` + remote dev `:8081` | 改 SFC 文案 → shim 重挂载更新，无刷新 |

复现命令：

```bash
pnpm --dir demos/remote exec vite --port 8081
pnpm --dir demos/host exec vite --port 5173          # 主 DEV
# 或
pnpm build && pnpm --dir demos/runtime-registry exec tsdown && pnpm --dir demos/host exec vite build
pnpm --dir demos/host exec vite preview --port 8090   # 主 PROD
```

### 13.4 路线 B 实现记录

已实现（第 7 节）：

- `linkjs`：`src/runtime/index.ts` 的 `loadRuntime(name, localLoader)`（按 name 缓存本地 runtime）；`createInstance({ mode })` 记录宿主模式（默认按 `import.meta.env` / `process.env.NODE_ENV` 探测）；全局 `$linkjs.loadRuntime`。
- `linkjs/vue`：`createRemoteApp(entry, options)` 容器组件（`onMounted/onUnmounted` 调 `mount/unmount`，`REMOTE_UPDATE` 时重挂载）。
- `unplugin-linkjs`：新增 `adaptiveRuntime` 选项，命中依赖改写为 `$linkjs.loadRuntime(name, () => import(name))`。
- demo：remote `index.ts` `expose { mount, unmount }`；remote `vite.config.ts` 配 `adaptiveRuntime: ['vue','vue-router','pinia']`；host `App.vue` 用 `createRemoteApp`。

**关键实现要点（踩坑）**：入口必须**先解析 runtime、再动态导入组件**：

```ts
async function mount(el, props) {
  const { createApp } = await loadRuntime('vue', () => import('vue'));
  const { default: HelloWorld } = await import('./components/HelloWorld.vue');
  createApp(HelloWorld, props).mount(el);
}
```

原因：若组件是入口的**静态导入**，它会在入口模块体（含 `loadRuntime` 的顶层 await）之前求值。宿主 PROD 下此时真实 `__VUE_HMR_RUNTIME__` 尚未建立，plugin-vue 的 `createRecord` 落在空全局/ shim 上，随后真实 runtime 里的 record 为空，HMR 静默失效。（在 `main.ts` 顶层 await 同样会破坏 DEV 的既有顺序，故必须在 `mount` 内做。）

实测：主 DEV / 主 PROD + 子 DEV **均**为原生就地 HMR、无整页刷新（`hmrLog: rerender:4686eca4`，文本更新）。

### 13.5 遗留

- shim（路线 A）依赖 plugin-vue 生成的裸全局 `__VUE_HMR_RUNTIME__` 出口；plugin-vue 大版本变化时需回归测试。
- 路线 B 的 `loadRuntime` 目前由入口手动保证加载顺序；可考虑由 unplugin 自动注入"runtime 先于组件"的虚拟入口，减少样板代码。
- demo 共享注册缺失导致的"双 Vue"问题已修复，但应作为通用约定（宿主要注册全部框架级共享依赖）写入文档/脚手架。
