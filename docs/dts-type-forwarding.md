# A1 · 远程 dts 类型转发设计

> 状态：**已实现**（PR1–PR4，闭环端到端已验证）· 关联：`docs/backlog.md` A1、`docs/development-plan.md`
> 目标读者：linkjs 维护者、宿主/远端集成方

---

## 1. 目标与范围

**目标**：远端（remote）构建产出类型声明并在 manifest 登记；宿主（host）消费后，`getRemote / loadLib / loadRemote` 的字符串参数能自动推导出完整类型。

**范围**：

- 只覆盖**模块级消费**：`getRemote / loadLib / loadRemote`；`loadApp`（`mount/unmount` 契约）不纳入。
- 区分两种生产者模式：**dev 态通知刷新**、**prod 态直接取不可变文件**。
- 不涉及跨框架 / SSR。

**非目标**：

- 不为 `loadApp` 生成类型。
- 不自动修改宿主 `tsconfig`（仅提供片段与校验提示）。
- 首版不拆分 per-expose 独立 d.ts（单文件覆盖）。

---

## 2. 术语与边界

| 概念        | dev 生产者                               | prod 生产者               |
| ----------- | ---------------------------------------- | ------------------------- |
| 类型产物    | 持续变化（含半成品）                     | 不可变（版本 / 内容寻址） |
| 长连接      | **有**（host 出站 SSE）                  | 无                        |
| 通知        | 构建完成 push `{name,version,typesHash}` | 无                        |
| host 取文件 | 收到通知后按需 GET 一次                  | 构建时一次性 GET          |
| 轮询        | 无（通道不可用则保留旧缓存）             | 无                        |

> 结论：**只有生产者处于 dev 模式时才需要长连接 + 响应通知**；发布态直接获取稳定的类型文件。

---

## 3. 总体架构

```
┌── Remote (build) ──────────────────────────────────────────┐
│ tsdown/rolldown 产出：lib.js + lib.d.ts                      │
│ manifest.json： mode / metaData.types / metaData.typesHash   │
│                                                             │
│  dev 模式：dev server 额外暴露                                │
│    GET /__linkjs/manifest.json   (指针)                      │
│    GET /__linkjs/events          (SSE)                       │
│    build 完成 → 广播 {name,version,typesHash}                 │
└─────────────────────────────────────────────────────────────┘
              ▲ fetch(type files)           ▲ SSE (dev only)
              │                             │
┌── Host (unplugin consumeTypes) ────────────────────────────┐
│ dev : 连接 SSE → 收到事件 → 比 hash → 拉 d.ts → 重建声明      │
│ prod: 构建 start 拉 manifest → 拉 d.ts → 重建声明（无通道）   │
│                                                             │
│  产物： node_modules/.linkjs/<remote>/<hash>.d.ts            │
│         node_modules/.linkjs/linkjs-remotes.d.ts (聚合声明)   │
│                                                             │
│  聚合声明增强（全局接口合并）：                               │
│                 interface LinkjsRemoteTypes { ... }          │
└─────────────────────────────────────────────────────────────┘
              │ tsserver watch
              ▼
        Host 业务代码： loadRemote('remote/Expose')  ← 有类型
```

---

## 4. 产物契约（manifest schema）

远端 manifest 新增：

```ts
interface ManifestJson {
  // 已有：name / version / description / entry / expose / exposes / shared / integrity ...
  /** 生产者模式：决定 host 是否建立长连接。 */
  mode?: 'development' | 'production';

  metaData?: {
    /** 扁平自包含的 .d.ts 路径（相对 outDir）。 */
    types?: string;
    /** d.ts 内容哈希（内容寻址 + host 去重）。 */
    typesHash?: string;
  };
}
```

- `typesHash` 由 d.ts 内容的 sha256/sha384 计算（构建期）。
- 若一个远端有多个入口/包，可升级为 `metaData.types: Record<exposeName, { path, hash }>`；**首版单文件**。
- **硬约束**：d.ts 必须**扁平自包含**（tsdown `dts` 已内联依赖类型）。文档中显式标注。

---

## 5. 远端实现

### 5.1 构建期（unplugin-linkjs，远端侧）

- `writeBundle` 已有 `entry.types`；新增：
  1. 读取该 d.ts 内容，计算 `typesHash`；
  2. 写入 `manifest.mode`（按构建/dev 探测）；
  3. 写入 `manifest.metaData.types` / `manifest.metaData.typesHash`。

### 5.2 dev server 通知端点

落在 `packages/tsdown-plugin-server`（远端已有）以及 linkjs 的 vite 插件：

- `GET /__linkjs/manifest.json`：返回当前指针 `{ name, version, typesHash, types }`（或直接复用产物 manifest）。
- `GET /__linkjs/events`：SSE。
  - 连接建立即发一次 `snapshot` 事件（当前指针，供 host 对齐，防漏事件）。
  - 构建完成发 `types-changed` 事件。
  - 心跳（每 ~15s 发送 `: ping`）保活 / 探活。
- 鉴权：可选 token（query/header），与运行时资源一致。

### 5.3 prod

- 无端点。产物静态、不可变。
- host 通过 **URL 直接拉取**：manifest 的 `metaData.types` 指向**版本 / 内容寻址**的 d.ts 路径
  （例如 `.../<version>/lib.d.ts` 或 `.../lib-<hash>.d.ts`），保证 URL 不可变、可长缓存、可复现。
- 不依赖 npm 发布链路；类型与运行时产物同源同版本。

---

## 6. 宿主实现（unplugin `consumeTypes`）

### 6.1 选项

```ts
interface ConsumeTypesOptions {
  remotes: RemoteTypeTarget[];
  /** 类型缓存根，默认 node_modules/.linkjs */
  outDir?: string;
  /** 聚合声明文件名，默认 linkjs-remotes.d.ts */
  dtsFile?: string;
  /** 鉴权 token（query/header），与 authPlugin 一致 */
  auth?: { token?: string | (() => string | Promise<string>); queryParam?: string };
  /** SSE 重连退避 */
  reconnect?: { minDelay?: number; maxDelay?: number; factor?: number };
}

interface RemoteTypeTarget {
  /** 模块名前缀，host 用 '<name>/<Expose>' 访问。 */
  name: string;
  /** 显式 manifest 地址；与 host 二选一。 */
  manifestUrl?: string;
  /** 由 host 推导 manifestUrl = host + '/manifest.json'。 */
  host?: string;
  /** 模式覆盖：auto(默认，读 manifest.mode + 探测) / development / production。 */
  mode?: 'auto' | 'development' | 'production';
}
```

### 6.2 行为

- **构建期对齐（dev + prod 都做一次）**：`buildStart` 拉各 manifest → 取 d.ts → 缓存 → 生成聚合声明。
- **dev 监听**：对 `mode === 'development'`（或 `auto` 且 `/__linkjs/events` 可达）的 remote 开 SSE：
  - 收到 `types-changed` → **去抖合并** → 比 `typesHash` → 变则拉 d.ts → 原子重写 → tsserver 刷新；
  - 断线：指数退避 + 抖动重连；**重连后先对齐当前指针**（防漏事件）。
- **prod**：不连通道；已缓存同 hash 则复用。
- **Node SSE 客户端**：不依赖浏览器 `EventSource`，用 `fetch` + `ReadableStream` 解析 `text/event-stream`（零依赖），规避 Node 版本差异。

### 6.2.1 dev 检测算法

判定某个 remote 是否需要建立长连接，按以下优先级：

1. **显式覆盖**：`RemoteTypeTarget.mode` 为 `'development'` / `'production'` 时直接采用。
2. **manifest 声明**：取远端 manifest 的 `mode` 字段（构建期写入），`'development'` 即 dev。
3. **探测兜底**：以上缺失时，尝试连 `/__linkjs/events`（或 HEAD 该端点）：
   - 连得上 → 判为 **dev**，建立 SSE；
   - 连不上 / 4xx / 超时 → 判为 **prod**，只取一次类型文件、不重连。

判定结果在本次会话内缓存；重连尝试时会重新探测，以支持「远端 dev server 先启动、host 后连」的场景。

### 6.3 生成内容（聚合声明）

```ts
// AUTO-GENERATED by unplugin-linkjs. Do not edit.
declare module 'remoteApp' {
  export * from './remoteApp/lib';
}
declare module 'remoteApp/HelloWorld' {
  export * from './remoteApp/lib';
}

// 全局接口合并（linkjs 以 `declare global` 声明同名接口）；
// 不用 `declare module 'linkjs'`，避免 ambient 声明遮蔽其真实导出。
interface LinkjsRemoteTypes {
  remoteApp: typeof import('remoteApp');
  'remoteApp/HelloWorld': (typeof import('remoteApp'))['HelloWorld'];
}
```

### 6.4 tsserver 刷新与 tsconfig 纳入

生成文件位于 `node_modules/.linkjs/`，默认会被 TS 的 `exclude`（默认含 `node_modules`）排除，需显式纳入。两种可靠做法（任选）：

**方式 A：`files` 显式列出**（`exclude` 不影响 `files`）

```jsonc
// host tsconfig.json
{
  "include": ["src", "env.d.ts"],
  "files": ["node_modules/.linkjs/linkjs-remotes.d.ts"],
}
```

**方式 B：在源码里放一个引用存根**（推荐，无需改 tsconfig 结构、可提交）

```ts
// src/linkjs-remotes.d.ts
/// <reference path="../node_modules/.linkjs/linkjs-remotes.d.ts" />
```

- 写入采用**原子写**（临时文件 → rename），避免 tsserver 读到半截内容。
- 启动时可检测聚合文件是否已纳入（读 tsconfig），未纳入则 warn 并提示上述片段。

---

## 7. linkjs 类型 API（运行时零改动）

```ts
// index.ts（入口模块）声明：全局接口，供 consumeTypes 生成声明做全局合并
declare global {
  interface LinkjsRemoteTypes {}
}

// 三个 API 增加字符串重载；注册表为空时自动回落原签名
function getRemote<K extends keyof LinkjsRemoteTypes & string>(entry: K): LinkjsRemoteTypes[K] | null;
function getRemote<M = unknown>(entry: string): M | null;

function loadLib<K extends keyof LinkjsRemoteTypes & string>(entry: K, options?: LoadLibOptions): Promise<LinkjsRemoteTypes[K] | null>;
function loadLib<M = unknown>(entry: string, options?: LoadLibOptions): Promise<M | null>;

function loadRemote<K extends keyof LinkjsRemoteTypes & string>(entry: K, options?: LoadOptions): Promise<LinkjsRemoteTypes[K] | null>;
function loadRemote<M = unknown>(entry: string, options?: LoadOptions): Promise<M | null>;
```

- 仅类型改动，运行时分发逻辑不变（`getRemote` 需从 `./loader` 改为入口包装以挂重载）。
- **100% 向后兼容**：未接入 `consumeTypes` 的工程 `LinkjsRemoteTypes` 为空 → 走旧泛型签名。

---

## 8. 缓存与一致性

- 目录：`node_modules/.linkjs/<remote>/<typesHash>.d.ts`（内容寻址）。
- 聚合声明引用当前 hash 文件；可选保留最近 N 版。
- 原子写；并发安全（hash 命名天然隔离）。
- prod 产物不可变 → 长缓存；dev hash 变化才替换。

---

## 9. 错误与降级

| 场景                   | 行为                                    |
| ---------------------- | --------------------------------------- |
| 远端不可达（dev）      | 保留旧缓存 + warn，不阻塞构建，退避重连 |
| 无 d.ts（未产类型）    | 跳过该 remote，记录诊断，不报错         |
| SSE 被代理拦截         | 视为 prod：只取一次，不重连             |
| hash 未变              | 跳过重写（幂等）                        |
| d.ts 非自包含          | 报错提示「远端需扁平化 d.ts」           |
| 聚合文件不在 `include` | 启动时检测并 warn（读取 tsconfig）      |

---

## 10. 安全

- SSE 与 d.ts 拉取复用 `authPlugin` 的 token（query 或 header）。
- 只信任 http(s) 源；校验 manifest `types` 为相对路径。

---

## 11. 关键时序

**dev 首次 + 变更**

1. host `buildStart`：拉 manifest，写缓存 + 聚合声明。
2. host 连 `/__linkjs/events` → 收 `snapshot` → 对齐。
3. 远端改代码 → 构建完成 → push `types-changed`。
4. host 去抖 → 比 hash → 拉新 d.ts → 原子重写 → tsserver 刷新。

**prod**

1. host `buildStart`：拉 manifest（含 `mode: 'production'`）→ 取不可变 d.ts → 写缓存 + 聚合声明。
2. 结束（无通道）。

---

## 12. 测试策略

- **纯函数单测**：聚合声明渲染器、SSE 帧解析器、缓存路径 / hash、快照去重。
- **集成测试**：临时起一个 mini http server 服务 `manifest.json` / `/__linkjs/events` / d.ts：
  - prod：拉取一次 + 生成内容正确；
  - dev：push 事件后 host 重拉 + 内容更新；
  - 重连后对齐；
  - 远端不可达 → 保留旧缓存。
- **linkjs**：重载靠 `tsc --noEmit` 保证；补一个 augmentation 的 type test（可引入 `tsd` / `vitest` `expectTypeOf`）。
- 全部 mock `fetch`，不依赖真实网络。

---

## 13. 文档

- Host 侧 README：`consumeTypes` 配置 + tsconfig `include` 片段 + dev/prod 行为说明。
- Remote 侧：`mode` / `metaData` 说明、d.ts 自包含要求。
- 更新 `docs/development-plan.md` 与 backlog A1 勾选。

---

## 14. 交付范围与拆分

**本次一次性做到闭环**（prod + dev 全链路），拆成可独立提交/回滚的 PR：

- **PR1 · 远端产物**：`manifest.mode` + `metaData.types` + `metaData.typesHash`（unplugin-linkjs 远端侧）。
- **PR2 · linkjs 类型 API**：`LinkjsRemoteTypes` + `getRemote / loadLib / loadRemote` 字符串重载（运行时零改动，向后兼容）。
- **PR3 · host 消费（prod + dev 闭环）**：unplugin `consumeTypes` —— 构建期对齐（URL 拉取 / 缓存 / 生成聚合声明）+ dev SSE 订阅（检测 / 去抖 / 重连 / 对齐）+ Node SSE 客户端 + 原子写 + tsconfig 校验提示。
- **PR4 · 远端 dev 通知端点**：`tsdown-plugin-server`（及 linkjs vite 插件）暴露 `/__linkjs/manifest.json` + `/__linkjs/events`，构建完成广播。
- **PR5 · 文档 / 示例**：README（consumeTypes 配置 + tsconfig 片段 + dev/prod 行为）、demo 串联验证、backlog A1 勾选。

**后续（可选，不在本次）**：CLI `sync-types`、快照记录 `typesHash`、独立 broker（跟 latest）、多入口 per-expose d.ts。

---

## 15. 风险与备选

- **网络耦合构建（prod 采用 URL 拉取，已确认）**：CI 需可访问远端。缓解：URL 不可变 + host 侧内容寻址缓存；CI 缓存 `node_modules/.linkjs` 或提交快照；失败保留旧缓存不 fail。远期备选仍可加「类型发 npm 包」。
- **tsconfig 纳入**：文件在 `node_modules/.linkjs`，默认被 `exclude` 排除，最易漏。缓解：提供 `files` 显式列出或「源码引用存根」两种片段（见 §6.4），并在启动时检测未纳入则 warn。
- **命名冲突（已接受）**：`<remote>/<Expose>` 可能遮蔽同名 npm 包。采用该约定；文档标注「remote 名不要与依赖包重名」，远期如需再加前缀（如 `@linkjs-remote/...`）。
- **Node SSE**：自实现解析，规避 `EventSource` 版本差异。
- **大 d.ts / tsc 性能**：单文件可能很大。备选：per-expose 拆分。

---

## 16. 决策

### 已确认

- **prod 分发形态**：**URL 拉取**。host 构建期从远端 manifest 的 `metaData.types`（版本 / 内容寻址、不可变）**直接拉取** d.ts，不走 npm 发布链路。
- **命名空间**：直接用 **`<remote>/<Expose>`**（如 `remoteApp/HelloWorld`），不加前缀。
- **dev 检测**：以 manifest `mode` 为准，缺失时探测 `/__linkjs/events` 兜底（详见 §6.2.1）。
- **生成文件位置**：`node_modules/.linkjs/`（需在宿主 tsconfig 显式纳入，见 §6.4）。
- **交付节奏**：**一次性做到闭环**（prod URL 拉取 + dev SSE 通知），见 §14 的 PR 拆分。

### 待确认

- 无（上述决策均已确认）。
