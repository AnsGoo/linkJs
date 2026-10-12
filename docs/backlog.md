# LinkJS 待办与路线图（Backlog）

> 汇总所有可做点，按领域分组。标签格式：`[价值 / 工作量]`（高/中/低）。
> 状态图例：`[x]` 已完成 · `[ ]` 待办。

---

## 0. 已完成基线（便于对照）

- [x] Shadow DOM CSS 隔离（`createRemoteApp{shadow}` / `LinkjsShadowRoot`）
- [x] dist 漂移根治（仅 dist 出口 + demo 自动构建 + `prepare`）
- [x] 运行时插件体系（init/remote/container/module/share/entry/preload + `apply` + 多插件）
- [x] 共享依赖选项（`eager` / `requiredVersion` / `strictVersion`）+ 多 shareScope
- [x] 可观测（快照 / 诊断通道 / DevTools 侧边栏 / 插件目录）
- [x] 清单 per-expose assets + `preloadRemote`
- [x] 构建期注入共享依赖版本（`linkjsSharedVersions`）
- [x] event-bus `once`/`clear` + 类型化事件
- [x] `remote.status` 生命周期、`unloadLib`、`createRemoteApp` loading/error
- [x] CSP/SRI 运行时透传 + **SRI 构建期生成**
- [x] CI（install→build→typecheck→test→lint）
- [x] 工程化清理（devepment 目录名、包元数据、pnpm overrides、share-runtime ESM）
- [x] 5 个插件：retry / fallback / logger / auth / timeout
- [x] 类型/工程质量（E1–E3）：消除 loader `any`、替代 Node `Module`、强类型 `LinkjsInstance` 与事件总线、加载选项收敛

---

## A. 模块联邦能力（对标 Module Federation）

- [x] **A1 dts 类型转发**：产出各远程 `.d.ts` 并写入 manifest `metaData.types`，宿主生成 `declare module 'remote/Expose'`，让 `loadRemote` 有完整类型。`[高 / 中]`（设计见 `docs/dts-type-forwarding.md`）
- [ ] **A2 标准 container `get/init` + `remoteType`(script/esm/module/manifest)**：打通离线 manifest 与跨宿主互通。`[高 / 大]`
- [ ] **A3 数据预取**：在资源预取之上加数据层（vue-query / react-query 联动）。`[中 / 中]`
- [x] **A4 `remoteSnapshot`/`globalSnapshot`**：预取前查询已加载，避免重复请求。`[中 / 中]`
- [x] **A5 `getPublicPath`**：CDN 动态基址自解析。`[中 / 小]`
- [ ] **A6 `import:false` / `shareKey` / `packageName` 别名**：只提供不消费、以别名共享同一实例。`[中 / 中]`
- [ ] **A7 `treeShaking` shared**：按需共享子依赖。`[中 / 中]`
- [x] **A8 `loadShareSync`**：同步取已加载实例（首屏用）。`[中 / 小]`
- [x] **A9 多 shareScope 声明式配置**（manifest / 构建期），现仅运行时。`[中 / 小]`
- [x] **A10 remote 多源列表 + 健康检查 / 灰度**。`[中 / 中]`

## B. 插件生态（继续扩展）

- [ ] **B1 preload 插件**：路由变化时自动 `preloadRemote`（预取下一屏）。`[高 / 小]`
- [ ] **B2 versionGuard 插件**：`requiredVersion` 严格化 + 冲突上报（诊断通道已就绪）。`[中 / 小]`
- [ ] **B3 errorBoundary 插件**：统一降级 / 上报（配合 `createRemoteApp` 的 `error` 槽）。`[中 / 小]`
- [ ] **B4 mock/dev 插件**：dev 下把远程指向 mock / 本地 fallback。`[中 / 小]`
- [ ] **B5 cache 插件**：远程 manifest / 产物本地缓存（localStorage / IndexedDB）。`[低 / 中]`

## C. 可观测 / DevTools

- [x] **C1 面板展示 logger 指标**（加载耗时 / 成功失败）+ 错误时间线。`[中 / 小]`（面板「加载指标」+「诊断」区；`ui.tsx`）
- [x] **C2 共享版本冲突面板**（谁需要 ^X / 谁提供 Y）。`[中 / 小]`（`buildSnapshot().conflicts` + 面板「共享冲突」区）
- [x] **C3 面板：复制 JSON、过滤、可调整宽度、多实例区分**。`[低 / 小]`（`ui.tsx`）
- [ ] **C4a `__LINKJS__` 操作入口 + Chrome DevTools 扩展**。`[中 / 大]`
  - [x] 基础操作（`load` / `preload` / `clearCache` / `unload`）+ 页内面板
  - [x] Chrome 扩展（只读快照，`tools/devtools-extension/`）
  - [ ] 补齐 share/remote 操作（`loadLib` / `unloadLib` / `getRemote` / `getShare` / `loadShare`）+ 面板操作按钮
  - [x] 扩展对齐页内面板（分区 / 过滤 / 复制 JSON / 多实例 / 操作按钮）
- [x] **C5 性能标记**：`performance.mark/measure` 记录各阶段耗时。`[低 / 小]`（`src/perf` + 面板「性能」区）
- [ ] **C6 事件总线实时面板**：`LIB_EXPOSE` / `SHARED_EXPOSE` / `REMOTE_UPDATE` 事件流。`[中 / 小]`
- [ ] **C7 指标聚合**：成功率 / 耗时 p50·p95 / 按 remote 分组。`[低 / 小]`
- [ ] **C8 诊断增强**：时间戳 + 资源级错误码（脚本/CSS 加载失败、SRI、CSP nonce）。`[中 / 小]`
- [ ] **C9 面板操作**：remote「卸载 / 重载 / 预取」按钮（依赖 C4a 操作入口）。`[低 / 小]`

## D. 隔离 / 安全

- [ ] **D1 CSP 端到端**：注入资源的 `nonce` 贯通（现仅继承远程 HTML）。`[中 / 中]`
- [ ] **D2 入口脚本 SRI**（需服务端或 `<script integrity>` 入口）。`[中 / 中]`
- [ ] **D3 Shadow 隔离完善**：lib 路径 HMR 样式归属、`Teleport`/portal 逃逸方案。`[中 / 中]`
- [ ] **D4 快照沙箱局限说明/增强**；可选 iframe/worker 真隔离（远期）。`[低 / 大]`

## E. 类型 / 工程质量

- [x] **E1 消除 `any`**：loader 的 `remoteInfo as any`；用真实类型替代 Node `Module`。`[高 / 中]`
- [x] **E2 event-bus 类型强约束**（实例是 `any`，泛型未真正生效）。`[中 / 小]`
- [x] **E3 选项类型收敛**：`LoadAppOptions & LoadLibOptions` 统一。`[低 / 小]`

## F. 工具链 / 生态

- [ ] **F1 typedoc API 文档 + changesets 版本/changelog**。`[中 / 小]`
- [ ] **F2 `create-linkjs` 脚手架**。`[中 / 中]`
- [ ] **F3 更多构建器集成**：Rollup / Webpack / Rspack（现 vite + rolldown）。`[中 / 大]`
- [ ] **F4 发布配置**：包名/version 实化、npm 发布、LICENSE/CHANGELOG。`[中 / 小]`

## G. 测试 / CI

- [ ] **G1 unplugin 覆盖率提升**（transform / manifest / 依赖图边界）。`[中 / 小]`
- [ ] **G2 e2e 纳入 CI**（Playwright 三端）。`[中 / 中]`
- [ ] **G3 DevTools / UI 的 DOM 测试**。`[低 / 小]`

## H. 文档 / 示例

> 目标：外部团队「看得懂、跑得起来、能扩展」。分三块：文档站（H1）、插件指南（H2）、示例矩阵（H3）。
> 现状：`docs/` 已有深度设计文档（HMR / 类型 / 可观测 / 远程依赖），demo 有 Vue 宿主 + 2 个子应用；
> 缺站点、缺 React、缺插件教程。
>
> 决策：站点用 **VitePress**；**暂不实现** `@linkjs/bridge`（React 先走 core-only 最小适配）；
> H1.7 先写**占位 API 页**，不阻塞 F1/typedoc。

### H1 文档站 / 指南 `[中 / 中]`

- [x] **H1.0 文档站脚手架**：**VitePress**（`docs/.vitepress/config.mts`）+ 导航/侧栏 + `docs:dev`/`docs:build`/`docs:preview`。`[中 / 小]`
  - [ ] 待办：GitHub Pages 部署 + CI 死链校验。
- [ ] **H1.1 快速开始**：安装、最小宿主 + 最小远端、dev/build 跑通（初稿已建 `docs/guide/getting-started.md`；待补截图）。`[高 / 小]`
- [ ] **H1.2 集成模式**：路线 A（构建期 `import` / `createRemoteComponent`）、路线 B（`createRemoteApp`）、运行时 `loadRemote` / `loadLib`（初稿已建 `docs/guide/integration-modes.md`）。`[高 / 小]`
- [ ] **H1.3 样式隔离（Shadow）**：捕获窗口与并发加载、`Teleport`/portal 逃逸边界、dev/build 一致性。`[中 / 中]`
- [ ] **H1.4 HMR 与类型热更新**：`REMOTE_UPDATE`、`/__linkjs/events` SSE `types-changed`、dev 生产者契约（`tsdown-plugin-server`）。`[中 / 中]`
- [ ] **H1.5 清单 / 预加载**：manifest 字段、`entry.assets`、`preloadRemote`、`consumeTypes.remotes[].preload`。`[中 / 小]`
- [ ] **H1.6 类型转发**：`consumeTypes` + `remoteImports` + tsconfig 纳入（对齐 A1 / `dts-type-forwarding.md`）。`[中 / 小]`
- [ ] **H1.7 API 参考**：先写**占位 API 页**（已建 `docs/api/index.md`，含核心导出表）；后续再接 typedoc（F1）。`[中 / 小]`
- **验收**：`pnpm --filter docs build` 通过；CI 死链校验；每篇指南挂一个可运行 demo 链接。

### H2 插件开发指南 `[中 / 小]`

- [ ] **H2.1 插件契约**：`RuntimePlugin` 全钩子清单 + 生命周期图（`init` / `beforeLoadRemote` / `afterResolve` / `beforeLoadContainer` / `beforeLoadEntry` / `afterLoadEntry` / `afterLoadContainer` / `onLoad` / `beforeLoadShare` / `afterLoadShare` / `beforePreloadRemote` / `errorLoadRemote` + `apply` 包装 `loadApp`/`loadLib`/`loadRemote`）。`[中 / 小]`
- [ ] **H2.2 示例插件**：`examples/plugin-analytics`，演示加载埋点与 `apply` 包装。`[中 / 小]`
- [ ] **H2.3 加入目录**：扩展 `availablePlugins`（catalog）+ DevTools 面板展示自定义插件（依赖 C4a）。`[低 / 小]`
- [ ] **H2.4 插件测试模板**：单测桩 + 文档片段。`[低 / 小]`
- **验收**：照文档从零新增一个插件 → 面板可见、单测通过、类型通过。

### H3 示例矩阵 `[中 / 中]`

- [ ] **H3.1 React 宿主**：`demos/host-react`（Vite + React），基于核心 `loadRemote`/`getRemote` + 最小 React 适配（`useRemoteComponent`）。**先不实现 `@linkjs/bridge`（J1）**。`[中 / 中]`
- [ ] **H3.2 多子应用**：一个宿主挂 2+ 远端，含 remote→remote（对齐 `remote-dependencies.md`）。`[中 / 小]`
- [ ] **H3.3 路由级预取**：切路由时 `preloadRemote` / 复用 B1 preload 插件。`[中 / 小]`（依赖 B1）
- [ ] **H3.4 跨构建器**：Vite 宿主 + tsdown/rolldown 子应用（`remote-lib` 已具雏形，补 README 与脚本）。`[低 / 小]`
- [ ] **H3.5 示例导航**：`demos/README.md` + 一键编排启动脚本。`[低 / 小]`
- **验收**：每个示例独立 `pnpm dev` 可起、含 README；冒烟 e2e 覆盖（对齐 G2）。

**H 依赖 / 建议顺序**：

1. 先做 **H1.0 + H1.1 + H1.2**（能力已就绪，最快见效）。
2. 再补 **H3.2 / H3.3**（多应用 + 路由预取，复用现有 demo 与 B1）。
3. 然后 **H1.3–H1.6、H2**（把已有设计文档整理为对外指南 + 插件教程）。
4. **H1.7 API 参考**：先出占位页（不依赖 F1）；**H3.1 React** 靠后（core-only，不依赖 J1 bridge）。
5. 前置：**I4**（同步过时文档）与 **C4a**（插件操作入口）尽早做，避免文档站发布过期内容。

## I. 仓库 / Demo 清理

- [ ] **I1 清理 `demos/remote/src/components/HelloWorld.vue` 调试残留**。`[低 / 小]`
- [ ] **I2 `demos/remote` / `remote-lib` 的 `exports` 规范化**。`[低 / 小]`
- [ ] **I3 `share-runtime` 去留**（僵尸包：删除或重命名整合）。`[低 / 小]`
- [ ] **I4 文档同步**：`docs/hmr-*.md` 过时片段对齐现状。`[低 / 小]`

## J. 跨框架 / SSR

- [ ] **J1 `@linkjs/bridge`**（Vue ↔ React 互嵌）。`[中 / 大]`
- [ ] **J2 SSR / Node 安全运行时**（document/window 收敛为 adapter）。`[中 / 大]`

---

## 建议优先顺序（Top 3）

1. **A1 dts 类型转发** — 使用体验提升最大，且不改运行时契约。
2. **B1 preload 插件** — 复用 `preloadRemote`，路由级预取实用。
3. **G2 e2e 纳入 CI** — 三端 Playwright 回归，防止跨宿主 / 跨构建器退化。

> 注：原第 3 项 **E1/E2 消除 any + event-bus 类型** 已完成（见 §E）。
