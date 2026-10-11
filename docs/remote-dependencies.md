# 远程间依赖（Remote Dependencies）实现方案

> 状态：**设计评审中**（未实现）。目标：让一个远程（App 或 Lib）声明依赖另一个远程，
> 运行时按拓扑自动加载、去重、检测环，并让依赖方拿到被依赖方 `expose` 的模块。

## 1. 背景与现状

- 当前 linkjs 的「依赖」只有 **共享 npm 包（`shared`）**：`packages/linkjs/src/loader/app.ts:85`、
  `loader/lib.ts:59` 只遍历 `remoteInfo.shared`。
- 远端 manifest 的 `dependencies` 也是指共享包（`packages/unplugin-linkjs/src/build-manifest.ts:138`），
  没有「remote 依赖 remote」的字段。
- 变通方式（命令式 `loadApp`/`loadLib`、宿主手动注入）可行但无声明、无拓扑、无去重。

本方案引入一等公民的 **远程间依赖**。

## 2. 术语

- **依赖方（dependent）**：声明依赖其他远程的远程（App/Lib）。
- **被依赖方（dependency / dep）**：被声明的远程。
- **拓扑加载**：先加载所有 dep，再加载依赖方。

## 3. 数据模型

### 3.1 运行时类型（`packages/linkjs/src/state/instance.ts`）

```ts
export interface RemoteDependency {
  /** 期望版本范围（semver range），缺省不校验。 */
  version?: string;
  /** 缺失是否致命，默认 true。 */
  required?: boolean;
  /** 覆盖 host（多环境 / CDN）。 */
  host?: string;
  /** 覆盖入口（相对 host）。 */
  entryName?: string;
  /** 依赖方用到的 expose 名（用于校验 + 预取）。 */
  expose?: string[];
}

export interface RemoteBase {
  // ...existing
  /** 该远程声明的远程依赖（名 -> 配置）。 */
  remotes?: Record<string, RemoteDependency>;
}
```

`RegistryOption`（`Omit<RemoteBase,'status'>`）自动带上该字段。

### 3.2 manifest 字段（`packages/unplugin-linkjs/src/types.ts`）

在 `ManifestJson` 增加与运行时对齐的 `remotes?`：

```ts
remotes?: Record<string, { version?: string; required?: boolean; host?: string; expose?: string[] }>;
```

### 3.3 构建期选项（`UnpluginLinkjsOptions`）

```ts
remotes?: Record<string, { version?: string; required?: boolean; host?: string; expose?: string[] }>;
```

写入 manifest（对齐 `shared` 的写法，见 `build-manifest.ts:164/182`、`index.ts:472-492`）。

## 4. 运行时解析（核心）

新增 `packages/linkjs/src/loader/deps.ts`：

```ts
import { getInstance } from '..';
import { getRemoteInfo } from './utils';
import { LOAD_STATUS } from '../event-bus/constant';
import { recordDiagnostic } from '../devtools';
import { VersionComparator } from '../share/version-comparator';

interface DepContext {
  stack: string[];                 // 环检测
  inflight: Map<string, Promise<void>>; // 去重
}

/** 解析并（拓扑地）加载某远程的全部远程依赖。 */
async function resolveRemoteDeps(name: string, ctx: DepContext): Promise<void> {
  const info = getRemoteInfo(name);
  const deps = info?.remotes ?? {};
  for (const [depName, depCfg] of Object.entries(deps)) {
    if (ctx.stack.includes(depName)) {
      recordDiagnostic({ level: 'warn', code: 'REMOTE_DEP_CYCLE', message: `cycle: ${[...ctx.stack, depName].join(' -> ')}` });
      continue; // 跳过回边
    }
    if (isLoaded(depName)) {
      verifyVersion(depName, depCfg.version);
      continue;
    }
    if (ctx.inflight.has(depName)) {
      await ctx.inflight.get(depName)!;
      continue;
    }
    const p = (async () => {
      await ensureRegistered(depName, depCfg);              // 未注册则用 depCfg/manifest 兜底注册
      await loadOne(depName, depCfg, { stack: [...ctx.stack, name], inflight: ctx.inflight });
      verifyVersion(depName, depCfg.version);
    })().catch((err) => {
      if (depCfg.required !== false) {
        recordDiagnostic({ level: 'error', code: 'REMOTE_DEP_ERROR', message: `dep "${depName}" of "${name}" failed: ${err}` });
        throw err;
      }
      recordDiagnostic({ level: 'warn', code: 'REMOTE_DEP_ERROR', message: `optional dep "${depName}" failed: ${err}` });
    });
    ctx.inflight.set(depName, p);
    await p;
  }
}
```

要点：
- **拓扑序**：递归 `loadOne` 内先 `resolveRemoteDeps(dep)` 再真正加载 dep。
- **去重**：`ctx.inflight` 对齐现有 `shareInflight`（`state/instance.ts:133`）。
- **环**：`stack` DFS 检测，默认**容忍跳过**并诊断；`strict` 模式可抛。
- **版本**：复用 `VersionComparator.satisfiesVersion`；冲突诊断 `REMOTE_DEP_VERSION_MISMATCH`。
- **失败语义**：`required !== false` 抛错；可选依赖仅告警。

### 4.1 接入点（`packages/linkjs/src/loader/index.ts`）

在 `loadApp` / `loadLib` 内、调用 `useLoadApp/useLoadRemoteLib` **之前**：

```ts
async function loadApp(entry, options) {
  ensureRemoteUpdates();
  const appName = entry.split('/')[0];
  await resolveRemoteDeps(appName, { stack: [appName], inflight: getInstance().remoteInflight ??= new Map() });
  setRemoteStatus(appName, LOAD_STATUS.LOADING);
  // ...existing
}
```

`remoteInflight` 挂到实例（`LinkjsInstance` 加 `remoteInflight?: Map<string, Promise<void>>`），避免模块级状态重复实例化的问题（与 `shareInflight` 一致）。

### 4.2 默认开关

`LoadBaseOptions`（`loader/options.ts`）增加：
```ts
/** 是否自动解析并加载声明的远程依赖，默认 true。 */
deps?: boolean;
```
宿主可对个别远程关闭。

## 5. 消费方式

依赖方 bundle 内：

```ts
import { getRemote, useRemote } from 'linkjs';

const HelloWorld = getRemote('remote-lib/HelloWorld'); // 已有 API，拓扑序保证命中
const store = useRemote('data-lib/Store');             // 新增便捷 API（惰性 + 就绪等待）
```

- DEV：子应用复用共享 runtime，`getRemote` 直接可见。
- PROD：由依赖方先触发拓扑加载，dep 加载完成后再加载自身。

新增 `useRemote`（薄封装 `getRemote` + 未加载时触发 `loadLib/loadApp` 并等待）。

## 6. 版本 / 去重 / 环 / 失败

| 情形 | 处理 |
|---|---|
| 同名 dep、range 相容 | 按 `name` 单例，只加载一次 |
| range 冲突 | 诊断 `REMOTE_DEP_VERSION_MISMATCH`；策略 `first-loaded`（默认）\| `highest` |
| 环 A→B→A | 诊断 `REMOTE_DEP_CYCLE`，DFS 跳过回边（`strict` 抛） |
| 缺失 + `required:true` | 抛错 `REMOTE_DEP_ERROR` |
| 缺失 + `required:false` | 告警继续 |

版本策略可复用实例的 `shareStrategy`，或新增 `remoteStrategy`。

## 7. 生命周期

- **引用计数**：实例加 `remoteRefs: Map<string, number>`；加载 dep 时 +1，依赖者卸载时 -1，归零才真正 `unloadRemote/unloadLib` + 清缓存。
- **HMR**：dep 重新 expose（`REMOTE_UPDATE`）向依赖方广播（依赖方可用 `subscribeRemoteUpdate`）——复用现有事件，无需新机制。
- **卸载顺序**：先依赖者、后 dep；引用计数保证不误卸。

## 8. 可观测性 & DevTools

- 快照（`devtools/index.ts`）：`RemoteSnapshot` 增加
  ```ts
  deps?: Array<{ name: string; version?: string; resolved?: string; status?: string; required?: boolean }>;
  ```
- **拓扑图**：现有 `HOST → remote → shared` 基础上，加 `remote → remote` 边（来自 `deps`）。
- 事件：`remoteDepResolve` / `remoteDepLoad`（写入 `events[]`）。
- 诊断：`REMOTE_DEP_CYCLE` / `REMOTE_DEP_VERSION_MISMATCH` / `REMOTE_DEP_ERROR` / `REMOTE_DEP_MISSING`。
- 扩展面板（`tools/devtools-extension/src/views/RemoteView.vue`）：远程详情加「依赖的远程 (n)」区块（名 · range · 实际版本 · 状态），拓扑加远程→远程边。

## 9. 类型转发

依赖方的 `consumeTypes.remotes` 里把它的远程依赖也列为 targets（复用 `docs/dts-type-forwarding.md` 的聚合机制），使 `<dep>/<Expose>` 有类型。

## 10. 分阶段落地（每阶段可独立提交/评审）

| 阶段 | 内容 | 主要文件 | 验收 |
|---|---|---|---|
| **P1 数据模型** | `RemoteDependency` 类型；manifest/registry/options 字段；unplugin 写入与校验 | `linkjs/src/state/instance.ts`、`unplugin-linkjs/src/{types,build-manifest,index}.ts` | manifest 出现 `remotes`，类型/既有测试通过（零行为变更） |
| **P2 运行时解析** | `loader/deps.ts`（拓扑/去重/环/版本）+ 接入 `loadApp/loadLib` + `remoteInflight` | `linkjs/src/loader/{deps,index,app,lib,options}.ts`、`state/instance.ts` | 单测：拓扑顺序、去重、环、版本冲突、required/optional |
| **P3 消费 API** | 确认 `getRemote` 可用 + 新增 `useRemote` + 文档 | `linkjs/src/index.ts` | demo 中依赖方拿到 dep 的 expose |
| **P4 生命周期** | 引用计数 + HMR 传播 + 卸载顺序 | `linkjs/src/loader/*`、`state/instance.ts` | 卸载不误删共享 dep；HMR 更新传播 |
| **P5 观测/DevTools** | 快照 `deps`、拓扑加边、诊断、面板区块 | `devtools/index.ts`、`tools/devtools-extension/src/views/RemoteView.vue` | 面板显示远程依赖与边 |
| **P6 Demo/测试** | `remoteApp` 依赖 `remote-lib`；新增/回归测试 | `demos/*`、`packages/linkjs/tests/*` | `pnpm -r test` 全绿；demo 实测 |

## 11. 测试计划

- 单元（`packages/linkjs/tests`）：
  - 拓扑：A 依赖 B，先加载 B 再 A；事件/状态顺序断言。
  - 去重：并发 `loadApp(A)`×2 只加载一次 B。
  - 环：A↔B 触发 `REMOTE_DEP_CYCLE` 且不栈溢出。
  - 版本：不满足 range → `REMOTE_DEP_VERSION_MISMATCH`；required:false 不阻断。
  - 卸载：引用计数正确。
- 集成：demo 宿主加载 `remoteApp`，`remoteApp` 内 `getRemote('remote-lib/HelloWorld')` 渲染。

## 12. 兼容性与风险

- 无 `remotes` 字段 → 行为零变更（回归安全）。
- DEV 共享 runtime 下的加载顺序与 HMR 为主要复杂点（依赖 P4）。
- 循环依赖只能「容忍」，真正的模块级循环仍需作者拆分。
- manifest 字段需同时改 dev server 侧生成，注意与既有 `shared` 生成路径一致。

## 13. 待定决策（需拍板）

1. **声明方式**：仅 manifest/registry（推荐）？是否也支持运行时 `loadApp(x,{deps:[...]})` 覆盖？
2. **版本冲突策略**：`first-loaded`（默认）还是 `highest`？是否需要 `strict` 抛错模式？
3. **环**：默认**容忍跳过**（推荐）还是直接报错？
4. **卸载**：是否引入引用计数（推荐）？
5. **消费 API**：只用 `getRemote`（已存在），还是加 `useRemote` 便捷 hook（推荐）？
