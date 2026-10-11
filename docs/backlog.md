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
  - [ ] 扩展对齐页内面板（分区 / 过滤 / 操作）
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

- [ ] **H1 文档站/指南**：HMR、Shadow 隔离、插件开发、清单/预加载。`[中 / 中]`
- [ ] **H2 插件开发指南**（写自定义插件 + 加入目录）。`[中 / 小]`
- [ ] **H3 示例矩阵**：React 宿主、多子应用、路由级预取。`[中 / 中]`

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
