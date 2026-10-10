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
- [x] 更新 `packages/linkjs/devepment/version-compare.md`。

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
- 分析与设计详见 `docs/hmr-design.md`。
- [ ] 远期（路线 B）：子应用自挂载 + 自适应 runtime（`vue` 生态同源），详见 `docs/hmr-design.md` 第 7 节。

---

## P7 隔离与安全

- [x] `overrideRemote` 输入校验：仅接受合法 http(s) URL，非法项跳过并告警；单个 host 失败不影响其它 host；fetch 增加超时。
- [x] **scoped 样式 id 跨应用冲突修复**：`@vitejs/plugin-vue` 6 在 dev 下用 `hash(相对路径)` 生成 scopeId（不含内容），不同应用相同路径的组件（如都以 `src/components/HelloWorld.vue`）会得到相同 `data-v-*`，导致样式互相覆盖。修复：`features.componentIdGenerator` 按应用加盐（host/remote 各自唯一），见 `demos/*/vite.config.ts`。
  - 通用建议：把该 salt 做成共享插件/构建约定；或做更彻底的 CSS 隔离（Shadow DOM / scoped 前缀）。
- [x] **CSS 作用域隔离**：`unplugin-linkjs` 提供 `createCssScopePlugin(scope)`（PostCSS），把子应用所有选择器加 `[data-linkjs-scope="<scope>"]` 前缀；宿主用该属性容器包裹子应用（独立运行时挂到根节点）。已接入 demo（remote），验证 host/remote 样式互不覆盖（host 500 / remote 900）。
- [x] **JS 快照沙箱**：`captureSnapshot/restoreSnapshot/activateSandbox/deactivateSandbox`。加载前快照 `globalThis`，`unloadRemote` 时删除子应用新增的全局并还原被修改的全局。
  - 局限：子应用以原生 ESM 同页加载，ESM 无法用 `with(proxy)` 包裹，运行期间仍可读写宿主全局；真运行时隔离需 iframe/worker 独立 realm（未做）。
- [ ] CSP / SRI integrity（需宿主与远端配合）。

---

## P8 测试与 CI（高）✅

- [x] `packages/linkjs` 单测覆盖 share/loader/sandbox/override（38 用例）。
- [x] 根 `package.json` 增加 `build`/`test`/`typecheck` 脚本。
- [x] `unplugin-linkjs` 增加 vitest（17 用例：dependency-graph / build-shared / transform / css-scope）。
- [x] lint/typecheck 全绿（本轮范围内）。

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
