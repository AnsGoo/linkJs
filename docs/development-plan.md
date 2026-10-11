# LinkJS 微前端方案完善计划

> 目标：在现有「构建期共享依赖 + 运行时全局单例 + 事件总线」的架构上，补齐**共享依赖运行时正确性、远程加载健壮性、生命周期、类型一致性、构建产物、测试**等缺口。
>
> 状态图例：`[x]` 已完成 · `[~]` 进行中 · `[ ]` 待办 · `[-]` 设计/暂不实现

---

## 0. 范围与原则

- 保留现有同页组合架构，不引入 iframe/沙箱（列为远期设计）。
- 所有改动必须有单测或可复现验证。
- 行为变更同步更新 `version-compare.md` 与本计划。

---

## P1 共享依赖运行时正确性（高）✅

### 1.1 修复 `registerShare`
- [x] 同 scope 同名、含 `singleton` 的已有注册：忽略后续注册（首个胜出）。
- [x] 非 `singleton`：追加多版本，不再 `push` 后被覆盖。
- 文件：`packages/linkjs/src/share/index.ts`

### 1.2 并发加载去重
- [x] 同一 `scope::name@version` 的并发 `loadShare` 复用同一 in-flight Promise。
- 文件：`packages/linkjs/src/share/index.ts`

### 1.3 明确并实现两种共享策略语义
- [x] 统一解析器，删除两份完全相同的实现。
- [x] `loaded-first`（现存行为）：优先已加载实例；无可用已加载时才加载。
- [x] `version-first`：在「已加载 + 可用」候选中选满足条件的最高版本，必要时升级加载。
- [x] `getShare` 只看已加载（两种策略一致）。
- [x] 更新 `packages/linkjs/development/version-compare.md`。

### 1.4 测试
- [x] `registerShare` 单例/多版本。
- [x] 并发去重。
- [x] 两种策略在「已加载旧版 + 可用新版」下的差异。
- 文件：`packages/linkjs/tests/share-strategy.test.ts`

---

## P2 远程加载健壮性（高）✅

### 2.1 `loadApp` 资源加载
- [x] 明确 `entry`（默认 host）与 `host` 语义，支持 `remoteInfo.entry.html`。
- [x] 加载 CSS（`link[rel=stylesheet]`）。
- [x] `link[rel=modulepreload]` 预加载。
- 文件：`packages/linkjs/src/loader/app.ts`、`loader/utils.ts`

### 2.2 错误传播
- [x] `loadScript` 失败默认 reject，提供 `ignoreError` 开关。
- [x] `Promise.all(preload)` 已 `await`，消除竞态。

### 2.3 超时与重试
- [x] expose 超时可配置（`timeout`）；网络/脚本加载支持 `retries`。

### 2.4 测试
- [x] 覆盖：CSS/脚本注入 + expose 解析；脚本失败 reject。
- 文件：`packages/linkjs/tests/loader.test.ts`

---

## P3 生命周期（中）~

- [x] 修复 `loadLib` 的 async Promise executor 反模式（避免未处理 rejection/挂起）。
- [x] 新增 `unloadRemote(name?)`：清缓存 + 移除该远程注入的 `<script>`/`<link>`（资源带 `data-linkjs-remote`）。
- [x] `clearRemoteCache` 语义文档化（仅清缓存，DOM 用 `unloadRemote`）。
- [ ] 设计：宿主与子应用 router/pinia 所有权约定（需业务侧配合）。

---

## P4 类型与接口一致性（中）✅

- [x] `RemoteBase.entry` 支持 `string | RemoteEntry`（`RemoteEntry` 定义）。
- [x] `loadApp`/`loadRemote`/`loadLib` 选项接口化并补 JSDoc（`LoadAppOptions`/`LoadLibOptions`）。
- [x] 导出补齐：`shared`/`getShare`/`loadRemote`/`unloadRemote`。
- [x] 修正 demos：runtime-registry 移除重复且类型错误的 `remote-lib` 注册。

---

## P5 构建产物（中）✅

- [x] `shared.js` 生成：复用主构建 chunk，避免重复打包；写入 `entry.shared`。
- [x] manifest `entry` 分类确定化：`js`/`types`(`.d.ts|.d.mts|.d.cts`)/`css`/`html`，跳过 sourcemap，多入口不互相覆盖。
- [x] `workspace:*` 版本解析：读取工作区包实际 `version`，不再写死 `1.0.0`。

---

## P6 开发体验（中）✅

- [x] dev 下子应用共享依赖被重写为 `$linkjs.loadShare`（unplugin `vite` hook）。
- [x] **主 DEV + 子 DEV 无刷新 HMR（原生）**：移除子应用的 `vite:beforeUpdate → location.reload`；共享 Vue 单例下 plugin-vue 的原生 SFC HMR 就地重渲染宿主实例。
  - 关键前提：**全页只能有一份 Vue runtime**。宿主必须把 `vue` 生态（`pinia`/`vue-router`）也注册为共享，否则子应用 `register-shares` 的本地回退会从子应用 origin 拉入第二份 Vue，覆盖全局 `__VUE_HMR_RUNTIME__` 导致 HMR 静默失效（demo 已修复）。
- [x] **主 PROD + 子 DEV 无刷新 HMR（linkjs shim）**：共享 Vue 为 prod build 缺少真实 HMR runtime，linkjs 安装最小 `__VUE_HMR_RUNTIME__` shim，接管 plugin-vue accept 回调，替换暴露槽位并广播 `REMOTE_UPDATE`；宿主经 `useRemoteModule` + `<component :is>` 响应式重解析。
- [x] 新增 API：`subscribeRemoteUpdate`、`linkjs/vue` 的 `useRemoteModule`；`unloadRemote` 清理 HMR 索引。
- [x] **入口/expose 形状变化免刷新**：unplugin dev 为调用 `expose()` 的模块注入 `import.meta.hot.accept()`，入口变更时重跑顶层 `expose()`（不再冒泡成整页刷新）→ 广播 `REMOTE_UPDATE` → 宿主重挂载/重解析。实测改入口 `index.ts` 无整页刷新。
- [x] **路线 B：子应用自挂载 + 自适应 runtime**：子应用 `expose { mount, unmount }` 自带 runtime 自我挂载；unplugin `adaptiveRuntime` 把框架依赖改写为 `$linkjs.loadRuntime(name, () => import(name))`——宿主 DEV 复用共享 dev runtime，宿主 PROD 回退子应用自带 dev runtime。宿主用 `linkjs/vue` 的 `createRemoteApp` 提供容器。
  - 入口**静态导入组件即可**：SFC 被改写后模块体顶部即 `await $linkjs.loadRuntime('vue', ...)`，先于 plugin-vue 的 `createRecord`，runtime 已就绪。（早期"需动态导入"的结论实为 `mode` 探测 bug 所致，已修复。）
  - 实测：主 DEV / 主 PROD + 子 DEV 均为**原生就地 HMR**、无整页刷新。
  - **多 dev 子应用共享同一份 dev runtime**：主 PROD 下 `loadRuntime` 把本地 dev runtime 登记到全局 `linkInstance`，后续子应用复用（不再各加载一份），避免多份 `__VUE_HMR_RUNTIME__` 全局互相覆盖导致 HMR 静默失效。
- 分析与设计详见 `docs/hmr-design.md`。

---

## P7 隔离与安全

- [x] `overrideRemote` 输入校验：仅接受合法 http(s) URL，非法项跳过并告警；单个 host 失败不影响其它 host；fetch 增加超时。
- [x] **scoped 样式 id 跨应用冲突修复**：`@vitejs/plugin-vue` 6 在 dev 下用 `hash(相对路径)` 生成 scopeId（不含内容），不同应用相同路径的组件（如都以 `src/components/HelloWorld.vue`）会得到相同 `data-v-*`，导致样式互相覆盖。修复：`features.componentIdGenerator` 按应用加盐（host/remote 各自唯一），见 `demos/*/vite.config.ts`。
  - 通用建议：把该 salt 做成共享插件/构建约定；或做更彻底的 CSS 隔离（Shadow DOM / scoped 前缀）。
- [x] **CSS 隔离统一为 Shadow DOM**：运行期 `createShadowIsolation` / `ensureShadowTarget`（`packages/linkjs/src/sandbox/shadow.ts`）把远程的 DOM 与样式一并放进 ShadowRoot；宿主消费**远程应用**用 `createRemoteApp(entry, { shadow: true })`，消费**远程库组件**用 `linkjs/vue` 的 `LinkjsShadowRoot` + `loadLib(entry, { shadow: true })`。dev/build 一致、与构建器无关，实测 host(500)/remote(900) 样式互不覆盖且 HMR 正常。
  - 旧的 PostCSS 前缀方案（`createCssScopePlugin` / `data-linkjs-scope`）已删除，不再使用。
- [x] **JS 快照沙箱**：`captureSnapshot/restoreSnapshot/activateSandbox/deactivateSandbox`。加载前快照 `globalThis`，`unloadRemote` 时删除子应用新增的全局并还原被修改的全局。
  - 局限：子应用以原生 ESM 同页加载，ESM 无法用 `with(proxy)` 包裹，运行期间仍可读写宿主全局；真运行时隔离需 iframe/worker 独立 realm（未做）。
- [ ] CSP / SRI integrity（需宿主与远端配合）。

---

## P8 测试与 CI（高）✅

- [x] `packages/linkjs` 单测覆盖 share/loader/sandbox/override（38 用例）。
- [x] 根 `package.json` 增加 `build`/`test`/`typecheck` 脚本。
- [x] `unplugin-linkjs` 增加 vitest（dependency-graph / build-shared / transform）。
- [x] lint/typecheck 全绿（本轮范围内）。

---

## P9 运行时插件与服务化（本轮增量）

### 9.1 运行时插件生命周期补全
- [x] 支持注册**多个**插件（`registerPlugin(plugin | plugin[])`，同名去重，按注册顺序执行）。
- [x] 补全并接入全部钩子：`beforeInit`/`afterInit`（`createInstance`）、`beforeLoadRemote`/`afterLoadRemote`/`errorLoadRemote`、`beforeLoadShare`/`afterLoadShare`、`beforeLoadEntry`/`afterLoadEntry`。
- [x] app/lib 对称：`loadApp` 与 `loadLib` 均触发上述钩子；`beforeLoadRemote` 的返回值串联改写 `remoteInfo`。
- [x] 钩子容错（异常记录后继续）；导出 `RuntimePlugin`/`registerPlugin`/`getPlugins`。
- 测试：`packages/linkjs/tests/plugins.test.ts`（8 用例）。

### 9.2 构建产物与工程化
- [x] dist 漂移根治：所有包 `exports` 只指向 dist；移除 tsdown 的 `exports.devExports`（改 `exports: false`），避免构建时回写 `development` 条件。
- [x] demo `dev`/`build` 先构建所用 workspace 包；根 `build` 纳入 `runtime-registry`；根 `prepare` 安装后构建。
- [x] `pnpm.overrides` 迁移到 `pnpm-workspace.yaml`；新增 `.npmrc` 关闭 run 前自动安装。
- [x] `packages/linkjs` 元数据修正；`devepment/` → `development/`。
- [x] `share-runtime` 修正描述与 ESM（`createRequire` / `import.meta.url`）。

### 9.3 测试与 CI
- [x] 修复会失败的 e2e 模板（host/remote）。
- [x] 新增 `.github/workflows/ci.yml`：install → build → typecheck → test → lint。

---

## P10 运行时健壮性补充（本轮增量）

- [x] **event-bus**：新增 `once`、`off(name)`（清空该事件全部监听）、`clear()`；提供 `LinkjsEvents` 类型化事件表与 `EventBus` 泛型。
- [x] **远程状态**：`remote.status` 全流程维护——开始加载置 `loading`、成功 `loaded`、失败/卸载 `unloaded`。
- [x] **`unloadLib`**：清理库缓存、HMR 索引与带 `data-linkjs-remote` 标记的资源。
- [x] **`createRemoteApp` 状态**：支持 `loading` / `error` 占位组件与 `onError` 回调。
- [x] **CSP / SRI**（运行时侧）：`loadScript` / `loadCss` 透传远程 HTML 中的 `integrity` / `crossorigin` / `nonce`。
- 测试：`tests/event-bus.test.ts`（6 用例）、`tests/loader.test.ts` 状态流转用例。

---

## P11 清单资源与预加载（借鉴 Module Federation）

- [x] **manifest 增加资源清单**：`entry.assets`（`js`/`css` 的 `sync`/`async`）与 `exposes: [{ name, path, assets }]`；unplugin 从 bundle 计算——Vite 走 `viteMetadata.importedCss`，缺失时回退把产出的 CSS 归到主入口。
- [x] **运行时 `preloadRemote`**：`preloadRemote({ name?, host?, manifestUrl?, prefetch? })` 拉取 manifest，用 `<link rel="modulepreload|preload|prefetch">` 预热 entry（可选 exposes）的 JS/CSS；附带 `beforePreloadRemote`/`afterPreloadRemote` 插件钩子。
- [x] 导出类型：`ManifestAsset` / `RemoteManifest` / `PreloadRemoteOptions`。
- 测试：`packages/linkjs/tests/preload.test.ts`（3 用例）；demo 宿主启动预取 remote-lib（实测 modulepreload=1、prefetch=3）。

---

## P12 插件生命周期扩展 & 共享选项（借鉴 Module Federation）

### 12.1 Runtime 插件（container / module 级）
- [x] 新增 `apply(instance)`（注册时装填）、`afterResolve`（remoteInfo 解析后）、`beforeLoadContainer`/`afterLoadContainer`（容器加载边界）、`onLoad`（暴露模块就绪，容器级）。
- [x] 在 `loadApp`/`loadLib` 全流程触发；`apply` 在 `registerPlugin` 时调用。
- 测试：`tests/plugins.test.ts`（apply）、`tests/loader.test.ts`（钩子触发顺序）。

### 12.2 共享依赖选项与多作用域
- [x] `ShareOption` 新增 `eager`（注册即加载）、`requiredVersion`（版本要求）、`strictVersion`（不满足则抛错，否则告警）。
- [x] `RemoteBase.shareScope?: string[]`：远程可关联多个共享作用域；`loadApp`/`loadLib` 预加载时按作用域逐个加载。
- [x] **A9 多 shareScope 声明式配置**：unplugin 生成 `manifest.shareScope`（显式 `shareScope` 选项，缺省由 `shared[*].scope` 推导，默认 `["global"]`）；运行时 `preloadRemote` / `loadOverride` 读取 manifest 并写回远程注册表；`loadApp`/`loadLib` 在缺省时由 `shared` 各依赖的 `scope` 推导。
- [x] **A8 `loadShareSync`（首屏同步取共享实例）**：已加载实例优先直接返回；否则同步求值候选的**同步工厂**（`() => Module`）并写入缓存；若只能异步加载（`() => Promise<Module>`）则抛错提示改用 `loadShare`；无声明返回 `null`；版本范围 / `strictVersion` 语义与 `loadShare` 一致。挂到实例 `loadShareSync` 与全局 `$linkjs.loadShareSync`。
- [x] **A10 remote 多源列表 + 健康检查 / 灰度**：`RemoteBase.sources` 声明多源，`sourceStrategy`（`first-healthy` | `weighted`）与 `healthCheck`（path/timeout/interval）配置选择；`selectRemoteSource` 先 `GET {base}/{path}` 探测健康（默认 `manifest.json`，结果按 interval 缓存），`first-healthy` 取首个健康源、`weighted` 在健康源中按 `weight` 灰度；`resolvePublicPath`（loadApp/loadLib）与 `preloadRemote`（manifest 解析）统一走源选择；`manifest.json` 亦可声明 `sources`；`clearHealthCache()` 手动失效。
- [x] **A4 `remoteSnapshot` / `globalSnapshot`**：运行时快照。`remoteSnapshot(name)` 返回单个远程的加载状态 + 预取情况（`manifestUrl` / `assets` / `prefetched` / `time`），`globalSnapshot()` 汇总所有已注册与已预取远程并带 `version`；`preloadRemote` 预取前先查快照（已预取或已 `LOADED` 则跳过，`force: true` 强制刷新），避免重复请求；`clearPrefetchCache()` 可手动失效。
- [x] **A5 `getPublicPath`（CDN 动态基址自解析）**：`resolvePublicPath` 按「调用方 `host` > 远程 `getPublicPath` > 远程静态 `publicPath` > 实例 `getPublicPath` > `host` > 页面 origin」解析入口基址；`loadApp`/`loadLib` 统一走 `new URL(entry, base)`；静态 `publicPath` 可由构建期（unplugin 选项）或 `manifest.json` 声明并经 `preloadRemote`/`loadOverride` 写回。
- 测试：`tests/share-strategy.test.ts`（eager / requiredVersion / strictVersion）、`tests/share-scope.test.ts`（作用域解析）、`tests/preload.test.ts` 与 `tests/override.test.ts`（manifest → 注册表）、`unplugin-linkjs/tests/build-manifest.test.ts`（构建期生成/推导）。

---

## P13 可观测性（快照 + 诊断，借鉴 Module Federation DevTools）

- [x] `getSnapshot()`：汇总 `instance`（name/version/mode/shareStrategy）、`remotes`（status/host/type/shareScope）、`shares`（scope × name × versions，含 loaded/requiredVersion/strictVersion/eager）、`plugins`、`diagnostics`。
- [x] 诊断通道：`recordDiagnostic` / `getDiagnostics` / `clearDiagnostics` / `onDiagnostic`；版本冲突记为 `SHARE_VERSION_MISMATCH`，远程加载失败记为 `LOAD_REMOTE_ERROR`（上限 200 条）。
- [x] 全局 `__LINKJS__`（含 `getSnapshot`）并挂到 `$linkjs.debug`；顺带修复 `registerRemote` 未写入 `name` 的问题。
- 测试：`tests/devtools.test.ts`（2 用例）；demo 宿主打印快照（实测 remotes 均 loaded、shares vue/pinia/vue-router）。

---

## P14 页内 DevTools 侧边栏（借鉴 Vue DevTools）

- [x] 开发模式挂载可折叠侧边栏（Vue TSX + Shadow DOM 隔离样式），**默认收起为右侧一条竖排 "LinkJS" 标签（可见）**；点击展开，快捷键 `Alt/Option+Shift+L` 切换。
- [x] 展开时给 `body` 加同侧内边距把内容推开（**停靠，不悬浮覆盖**）；`position: 'right'|'left'`。
- [x] 面板展示 远程应用 / 共享依赖 / 插件 / 诊断；展开时每秒刷新，出现 error 诊断时标签显示红点。
- [x] **插件目录**：`availablePlugins` 登记内置插件，面板列出全部可用插件（内置 + 自定义）并标注「已启用 / 可用」。
- [x] 面板实现动态 `import()` 懒加载（独立 chunk，`vue`/`vue/jsx-runtime` 为外部依赖），生产构建不加载。
- 实测：默认标签可见（34px，右侧）→ 点击展开（`body.paddingRight=384`）→ 显示 `vue=3.5.43 / pinia=3.0.4 / vue-router=5.4.0`。

---

## P15 构建期注入共享依赖版本（自动补齐）

- [x] `unplugin-linkjs` 新增 `linkjsSharedVersions()`：构建期从 `node_modules` 读取已安装版本，经 `transformIndexHtml` 注入 `globalThis.__LINKJS_SHARED_VERSIONS__`，并提供虚拟模块 `virtual:linkjs-shared`。
- [x] 运行时 `registerShare` 对未声明 `version` 的共享依赖**自动补齐**（DevTools 面板 / 版本诊断使用），无需手写。
- 实测：宿主未手写任何版本，DevTools 显示 `vue=3.5.43 / pinia=3.0.4 / vue-router=5.4.0`。

---

## P16 Retry / Fallback 运行时插件

- [x] 运行时加载方法挂到实例（`instance.loadApp/loadLib/loadRemote`）；导出的函数经实例分发，插件可用 `apply(instance)` 包装/扩展。
- [x] `retryPlugin({ fallbackHosts, fallback, retries, onRetry, onError })`：加载失败时按候补 host 依次重试（CDN 多源 / 灰度 / 降级域名）。
- [x] 惰性 `ensureRuntimeMethods()` 避免循环导入期实例未就绪；同步暴露 `$linkjs.loadApp/loadLib/loadRemote`。
- 测试：`packages/linkjs/tests/retry.test.ts`（4 用例）。

---

## P17 Fallback 降级运行时插件

- [x] `fallbackPlugin({ fallback, defaultFallback, onError })`：加载失败时 **resolve 兜底值/占位** 而非 reject，容器优雅降级。
- [x] 与 `retryPlugin` 组合（顺序 `[retry, fallback]`）：先多源重试、全部失败再降级；内置目录加入 `linkjs-fallback`。
- 测试：`packages/linkjs/tests/fallback.test.ts`（5 用例）；demo 注册两个插件，DevTools 显示 `插件 (2/2)`。

---

## P18 Logger 插件（加载日志 / 指标）

- [x] `loggerPlugin({ log, prefix, collect })`：包装加载方法记录每次加载的耗时/结果（含重试的各次尝试），并经 `afterLoadShare`/`afterPreloadRemote` 记录共享与预加载事件。
- [x] `getLoadMetrics()` / `clearLoadMetrics()`；内置目录加入 `linkjs-logger`。
- 测试：`packages/linkjs/tests/logger.test.ts`（4 用例）；demo 注册 3 个插件，DevTools 显示 `插件 (3/3)`。

---

## P19 Auth 插件（鉴权注入）

- [x] **核心请求重写钩子**：`instance.requestRewriters` + `rewriteRequestUrl(url, remoteName)`，应用于入口 HTML / 脚本 / 样式 / modulepreload / 库入口（含 shared 入口）。
- [x] `authPlugin({ token | tokens, queryParam, origins, applyTo })`：`beforeLoadRemote` 异步解析 token 并缓存，重写器统一追加鉴权参数。
- [x] 内置目录加入 `linkjs-auth`；demo 注册 4 个插件，DevTools 显示 `插件 (4/4)`。
- 测试：`packages/linkjs/tests/auth.test.ts`（4 用例）。
- 局限：`<script>`/`<link>` 无法设置请求头，故用 query 参数；子模块的**嵌套动态 import** 由浏览器相对解析、不经重写器，通常需服务端在首个请求后下发会话 Cookie。

---

## P20 Timeout / Abort 插件

- [x] 加载器支持 `AbortSignal`（`LoadAppOptions.signal`）；`fetchHtml` 以 `fetch(url, { signal })` 加载入口 HTML。
- [x] `timeoutPlugin({ timeout, timeouts, onTimeout })`：包装加载方法做超时竞速；超时通过 `AbortController` 中止入口 fetch，并以 `TimeoutError` 拒绝（`timeout: 0` 关闭）。
- [x] 导出 `TimeoutError`；内置目录加入 `linkjs-timeout`；demo 注册 5 个插件，DevTools 显示 `插件 (5/5)`。
- 测试：`packages/linkjs/tests/timeout.test.ts`（4 用例）。

---

## P21 SRI 完整性生成

- [x] unplugin 构建期对每个产物（js/css/html）计算 `sha384`，写入 manifest `integrity`（`path -> sha384-...`）。
- [x] 运行时：`preloadRemote` 按 `manifest.integrity` 为预加载 `<link>` 设置 `integrity`；`loadOverride` 读取 `manifest.integrity` 存入 `remote.integrity`（`RemoteBase.integrity`）。
- 测试：`tests/preload.test.ts` 增加 integrity 用例；实测 remote-lib `mf/manifest.json` 含全部产物 hash。

---

## P22 可观测 / DevTools 增强（backlog C 组）

- [x] **C1** 面板：指标（logger 加载耗时/成功失败）+ 性能（各阶段，含**共享依赖加载**）+ 诊断即错误时间线。
- [x] **C2** 共享冲突面板：`buildSnapshot.conflicts` 展示「谁需要 X / 谁提供 Y」。
- [x] **C3** 面板：复制 JSON、文本过滤、拖拽调整宽度、`instance.id` 多实例区分、快捷键。
- [x] **C4** `__LINKJS__` 操作入口（`load/preload/clearCache/unload/remotes/shares/conflicts/metrics/perf`）+ Chrome DevTools 扩展脚手架（`tools/devtools-extension/`）。
- [x] **C5** 性能标记 `performance.mark/measure`：`fetch` / `scripts` / `total` / **`share`**。
- [x] 修复：观测数据（diagnostics/metrics/perf）改用 `globalThis` 桶存储，避免打包拆分导致读/写分属不同副本。
- 测试：`tests/perf.test.ts`、`tests/devtools.test.ts`（冲突/指标/perf/id）。

---

## 执行记录（本轮）

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| P1 | 完成 | 重写 `share/index.ts`；新增 12 条策略/并发测试 |
| P2 | 完成 | 重写 `loader/app.ts`/`utils.ts`；新增 2 条 loader 测试 |
| P3 | 完成 | 新增 `unloadRemote` + 资源归属标记；`loadLib` 反模式修复 |
| P4 | 完成 | entry 联合类型 + 选项接口 + 导出补齐；runtime-registry 去重 |
| P5 | 完成 | manifest 分类确定化 + `workspace:*` 版本解析 |
| P6 | 完成 | dev 共享重写 + 子应用更新刷新宿主 |
| P7 | 部分 | overrideRemote 校验 + CSS 隔离 + JS 快照沙箱完成；CSP/SRI 远期 |
| P8 | 完成 | linkjs 38 + unplugin 17 用例；根脚本齐全 |

### 验证命令
```bash
pnpm -r --filter "./packages/*" build
pnpm test
pnpm typecheck
pnpm lint
```
