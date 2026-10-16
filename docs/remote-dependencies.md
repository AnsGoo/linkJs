# 远程间依赖（Remote Dependencies）实现方案

> 状态：**P1/P2/P4/P5 已实现** + Demo（`demos/showcase` 的「总览 / 运行时加载 / 构建期 import」，以及 `demos/remote` 的 remoteApp→remote-lib）。P3 复用既有 `remoteImports`，未新增 API。
> 目标：让一个远程（App 或 Lib）声明依赖另一个远程，运行时按拓扑自动加载、去重、检测环，
> 并让依赖方消费被依赖方 `expose` 的模块。
>
> 修订：**v2** —— 对齐主干新增能力（`remoteImports` / 运行时引导 / `createRemoteComponent`）。

## 1. 现状盘点（先对齐已有能力）

| 能力                                                                                                                           | 位置                                                                                                   | 面向          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------- |
| **声明式消费** `import { X } from '<remote>'` → 虚拟模块（`createRemoteComponent`）                                            | `packages/unplugin-linkjs/src/remote-imports.ts`、`index.ts`（`resolveId`/`load`/`vite.config.alias`） | 宿主          |
| **构建期运行时引导**：`__linkjs_remote_hosts__`（名→host）、`__linkjs_preload__`（启动预加载）经 `transformIndexHtml` 内联注入 | `runtime-bootstrap.ts`、`unplugin-linkjs/src/index.ts`                                                 | 宿主入口 HTML |
| **运行时回退注入 host**                                                                                                        | `loader/utils.ts`（`getInjectedRemoteHost` → `resolvePublicPath`）、`preload/index.ts`                 | 宿主          |
| **启动自动预加载**：`createInstance` 消费 `__linkjs_preload__`                                                                 | `packages/linkjs/src/index.ts`（`runBootPreloads`）                                                    | 宿主          |
| **声明式预加载**：`consumeTypes.remotes[].preload`（bool/对象）                                                                | `unplugin-linkjs/src/types.ts`                                                                         | 宿主构建期    |
| **运行时消费**：`loadRemote` / `loadLib` / `getRemote` / `createRemoteComponent` / `createRemoteApp`                           | `linkjs/src/index.ts`、`linkjs/src/vue.ts`                                                             | 宿主 + 远程   |
| **多应用样式隔离**：scoped id（`linkjsVueOptions`）、shadow 捕获按 appName                                                     | `vue-plugin.ts`、`sandbox/shadow.ts`                                                                   | 宿主          |
| **共享 npm 包依赖**（`shared` + 拓扑上报）                                                                                     | `loader/app.ts:85`、`loader/lib.ts:59`                                                                 | 宿主          |

**关键结论**：现有「声明式远程消费」工具链完整，但**只面向宿主**。远程没有声明依赖的入口，
也没有拓扑/顺序/去重/环/版本处理。

## 2. 缺口（本方案要补的）

1. **无远程侧声明**：remote 无法声明“我依赖某远程”。
2. **无拓扑/顺序/去重/环/版本**：并发加载可能重复、顺序不定。环**在构建期无检测**（拟在 unplugin 补，§15）。
3. **内联引导在嵌入时不执行**：`loadApp` 只处理 `doc.querySelectorAll('script[src]')`（`loader/app.ts:170`），
   远程 App HTML 里由 `transformIndexHtml` 注入的**内联** `__linkjs_remote_hosts__`/`__linkjs_preload__`
   **不会运行** → 远程自己的 `preload` 引导失效，依赖只能由宿主侧解析。
4. **多运行时**：dev 下子应用复用宿主 runtime；prod 下各自 runtime。依赖归属/去重语义未定义。

## 3. 目标 / 非目标

- **目标**：远程声明的 `remotes` 依赖能被解析成**拓扑序**加载；同名去重、版本按需校验、**构建期环拦截**；
  依赖方可用 `import { X } from '<dep>'` 或 `getRemote('<dep>/<Expose>')` 消费；面板可见 `remote → remote` 边。
- **非目标**：模块级细粒度依赖图（属构建产物分析）；跨构建器的 tree-shaking。

## 4. 设计总览

```
构建期（远程 App/Lib）                    运行时（宿主）
  consumeTypes.remotes / remotes  ──►  manifest.remotes
                                             │  宿主 loadApp(dependent) 前
                                             ▼
                                    resolveRemoteDeps(dependent)   ← 拓扑 + 去重 + 环 + 版本
                                             │
             ┌───────────────┬──────────────┴───────────────┐
             ▼               ▼                              ▼
       loadApp(dep)     loadLib(dep)              getRemote('<dep>/<Expose>')
        (html)            (js)                    import { X } from '<dep>'
```

**核心决策【已定】：依赖由「宿主侧」统一解析加载**（去重/版本集中在宿主），远程侧只负责消费。

- 理由 a：远程被嵌入时其内联引导不执行（§2.3），自治加载不可靠。
- 理由 b：dev 共享 runtime，宿主加载即全局可见；prod 由宿主保证先行顺序。
- 兜底：远程本身带 `consumeTypes`（自身 prod runtime 有 `runBootPreloads`）时也能自治；宿主侧解析仍优先，避免重复。

## 5. 数据模型

### 5.1 运行时（`packages/linkjs/src/state/instance.ts`）

```ts
export interface RemoteDependency {
  version?: string; // semver range，缺省不校验
  required?: boolean; // 默认 true
  host?: string; // 覆盖（多环境/CDN）
  entryName?: string; // 覆盖入口
  expose?: string[]; // 用到的 expose（校验 + 预取提示）
}
export interface RemoteBase {
  /* ...existing */ remotes?: Record<string, RemoteDependency>;
}
```

### 5.2 manifest（`unplugin-linkjs/src/types.ts` 的 `ManifestJson`）

```ts
remotes?: Record<string, { version?: string; required?: boolean; host?: string; expose?: string[] }>;
```

### 5.3 构建期生成

**【已定】从 `consumeTypes.remotes` 自动派生** `manifest.remotes`，避免双声明：

- 远程 App 的 `consumeTypes.remotes[i]`：`{ name, host?/manifestUrl?, preload? }`
  → 生成 `manifest.remotes[name] = { host: host ?? origin(manifestUrl), required: true }`。
- 允许 `UnpluginLinkjsOptions.remotes` 覆盖/补充（`version`/`required`/`expose`）。
- 写入路径对齐既有 `shared`/manifest 生成（`build-manifest.ts`、`index.ts` around 472–492）。
- **加载归属【已定】：宿主集中解析**（远程自治仅作兜底，见 §4）。

> 注意：`consumeTypes.remotes[].preload` 目前只影响**宿主**的 `__linkjs_preload__`（启动预取）。
> 它不产生拓扑加载；本方案把它升级为“声明依赖”的输入之一，运行时由 `resolveRemoteDeps` 落实。

## 6. 运行时解析（`packages/linkjs/src/loader/deps.ts`）

```ts
async function resolveRemoteDeps(name, ctx: { stack: string[]; inflight: Map<string, Promise<void>> }) {
  for (const [depName, dep] of Object.entries(getRemoteInfo(name)?.remotes ?? {})) {
    if (ctx.stack.includes(depName)) {
      // 防御性兜底：环应在构建期被拦截（§15），运行时不作为主方案。
      recordDiagnostic({ level: 'warn', code: 'REMOTE_DEP_CYCLE', message: [...ctx.stack, depName].join(' -> ') });
      continue;
    }
    if (isLoaded(depName)) {
      verifyVersion(depName, dep.version);
      continue;
    }
    if (ctx.inflight.has(depName)) {
      await ctx.inflight.get(depName)!;
      continue;
    } // 去重
    const p = (async () => {
      ensureRegistered(depName, dep); // 未注册则兜底注册（host 可用 __linkjs_remote_hosts__）
      await resolveRemoteDeps(depName, { stack: [...ctx.stack, name], inflight: ctx.inflight }); // 递归：拓扑
      await loadOne(depName, dep); // 按 type 选 loadApp/loadLib
      verifyVersion(depName, dep.version);
    })().catch((err) => {
      if (dep.required !== false) throw err;
      recordDiagnostic({ level: 'warn', code: 'REMOTE_DEP_ERROR', message: `optional "${depName}" failed` });
    });
    ctx.inflight.set(depName, p);
    await p;
  }
}
```

- **接入点**：`loader/index.ts` 的 `loadApp`/`loadLib` 在 `useLoadApp/useLoadRemoteLib` **之前**调用；
  `LoadBaseOptions` 增加 `deps?: boolean`（默认 true）供关闭。
- **去重**：`remoteInflight` 挂到实例（对齐 `shareInflight`）。
- **host 解析**：`ensureRegistered` 未找到时，`resolvePublicPath` 已会回退 `__linkjs_remote_hosts__`（§1）。
- **版本策略【已定】**：默认 `first-loaded`，**不校验**；仅当依赖**显式声明了 `version`** 时才校验/按需解析
  （复用 `VersionComparator`，不满足则诊断 `REMOTE_DEP_VERSION_MISMATCH`，`required:false` 时为警告）。
- **环【已定】**：**构建期检测**为主（§15）；运行时不额外处理（保留上行的防御性跳过）。

## 7. 消费路径（对齐 `remoteImports`）

- **构建期（推荐）**：依赖方对其 dep 配 `consumeTypes.remotes[].preload` → 生成
  `import { HelloWorld } from '<dep>'`，虚拟模块内部即 `createRemoteComponent('<dep>/HelloWorld', { host, shadow })`
  （host 来自依赖方构建期 `consumeTypes.remotes[].host`）。
  → 运行时仍由宿主 `resolveRemoteDeps` 保证 dep 先加载。
- **运行时**：`loadRemote('<dep>/<Expose>')` / `getRemote('<dep>/<Expose>')`（缓存已改实例级，跨 bundle 可见）。
- 不新增 `useRemote`（见 §14-6）。

## 8. 生命周期

- **引用计数【已定】** `remoteRefs: Map<name, number>`：加载 dep +1，依赖者卸载 -1，归零才真正卸载。
- **HMR**：dep 重新 `expose`（`REMOTE_UPDATE`）→ 依赖方 `subscribeRemoteUpdate` 刷新。
- **卸载顺序**：先依赖者、后 dep。

## 9. 可观测 & DevTools

- 快照 `RemoteSnapshot` 增加 `deps?: { name; version?; resolved?; status?; required? }[]`。
- **拓扑图**：现有 `HOST → remote → shared` 之上加 `remote → remote` 边。
- 事件：`remoteDepResolve` / `remoteDepLoad`；诊断：`REMOTE_DEP_CYCLE` / `_VERSION_MISMATCH` / `_ERROR` / `_MISSING`。
- 面板（`tools/devtools-extension/src/views/RemoteView.vue`）：远程详情加「依赖的远程 (n)」区块。
- 对齐 backlog **H3.2**（多子应用含 remote→remote）。

## 10. 类型转发

依赖方 tsconfig 纳入聚合声明（复用 `consumeTypes` + `remoteImports`，见 `docs/dts-type-forwarding.md`），
使 `import { X } from '<dep>'` 有类型。

## 11. 分阶段落地

| 阶段              | 内容                                                                                                                             | 主要文件                                                                              | 验收                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| **P1 模型**       | `RemoteDependency`；manifest/registry/options 字段；由 `consumeTypes.remotes` 派生 `manifest.remotes`；**构建期环检测**（§15.1） | `linkjs/src/state/instance.ts`、`unplugin-linkjs/src/{types,build-manifest,index}.ts` | manifest 出现 `remotes`；环报错；零行为变更   |
| **P2 运行时解析** | `loader/deps.ts`（拓扑/去重/版本）+ 接入 + `remoteInflight`                                                                      | `linkjs/src/loader/{deps,index,app,lib,options}.ts`                                   | 单测：顺序/去重/版本（仅声明时校验）/required |
| **P3 消费**       | 复用 `remoteImports`（不新增 API，除非 §14 决定）                                                                                | 文档                                                                                  | `import { X } from '<dep>'` 在依赖方可用      |
| **P4 生命周期**   | 引用计数 + HMR + 卸载顺序                                                                                                        | `linkjs/src/loader/*`、`state/instance.ts`                                            | 不误卸；HMR 传播                              |
| **P5 观测**       | 快照 `deps`、拓扑加边、诊断、面板区块                                                                                            | `devtools/index.ts`、`RemoteView.vue`                                                 | 面板显示依赖与边                              |
| **P6 Demo/测试**  | `remoteApp` 依赖 `remote-lib`（H3.2）+ 单测                                                                                      | `demos/*`、`tests/*`                                                                  | `pnpm -r test` 全绿                           |

## 12. 测试计划

- 单测：拓扑顺序、并发去重、**构建期环检测**（unplugin）、版本（仅声明时校验）、required/optional、卸载引用计数。
- 集成：demo 宿主加载 `remoteApp`；`remoteApp` 内 `import { HelloWorld } from 'remote-lib'` 或 `getRemote` 渲染。
- 回归：无 `remotes` 字段时行为不变。

## 13. 兼容性与风险

- **零回归**：无 `remotes` 字段 → 行为不变。
- **内联引导不执行**（§2.3）：远程自治加载不可靠，故依赖集中宿主侧解析。
- **prod 多 runtime**：宿主与远程各自 runtime 可能都尝试加载 dep；靠宿主先加载 + 去重表缓解。
- **dev 共享 runtime + HMR**：主要复杂点（P4 处理）。
- **环**：构建期拦截（§15），运行时不处理；真正的模块级环仍需作者拆分。

## 14. 决策记录

**已定：**

1. **声明方式**：`manifest.remotes` 由 `consumeTypes.remotes` **自动派生**，`UnpluginLinkjsOptions.remotes` 可覆盖/补充。
2. **加载归属**：**宿主集中解析**（远程自治仅兜底）。
3. **版本冲突**：默认 `first-loaded` **且不校验**；**仅当依赖显式声明了 `version`** 时才校验/按需解析。
4. **环**：**构建期检测**（§15）；运行时不做专门处理。
5. **卸载**：**引入引用计数**。

6. **消费 API**：**不加 `useRemote`**，复用现有 `import { X } from '<dep>'`（`remoteImports`）+ `getRemote`。
   - 为此把远程模块缓存从**模块级**改为**实例级**（`instance.remoteCache`），使依赖方 bundle 内的
     `getRemote('<dep>/<Expose>')` 与宿主共用同一缓存（跨 bundle / 多份 linkjs 副本）。`loader/index.ts`。

**实现状态：** P1（类型 + unplugin manifest/环检测）、P2（`loader/deps.ts` 拓扑/去重/版本）、
P4（引用计数 + 卸载顺序）、P5（快照 `deps` + 扩展面板/拓扑）已落地；Demo：`demos/showcase`（多页示例集）。
测试：`packages/linkjs/tests/remote-deps.test.ts`、`packages/unplugin-linkjs/tests/remote-dep-graph.test.ts`。

## 15. 循环依赖：专项方案（本轮不实现）

> 决策：**先不在运行时处理环**；改为**构建期检测**，并另立专项解决方式。

### 15.1 构建期检测（随 P1/P2 落地）

- 在 **宿主构建**（unplugin）或独立命令 `linkjs check` 中，从 `consumeTypes.remotes` 出发，
  递归拉取各 remote manifest 的 `remotes`，构建有向图。
- 用 DFS 栈或 **Tarjan SCC** 找环；发现即**报错**并打印环路径（如 `A -> B -> A`）。
- 优点：一次构建即可发现跨项目的环，避免运行期不确定性；对运行时零成本。

### 15.2 运行时防御（保留但不作主方案）

- `resolveRemoteDeps` 保留 `stack`，命中环仅 `warn + 跳过回边`（§6），防止误配导致栈溢出。

### 15.3 真正需要环时的专门解决方式（提案，后续单独评审）

远程间出现环通常表示**契约设计问题**，建议按以下优先级处理：

1. **依赖反转（首选）**：把 A、B 互相依赖的部分抽成**第三个无依赖的 remote**（契约/事件总线/共享 store），
   A、B 均只依赖它 → 图退化为 DAG。
   ```
   A ─┐           契约
      ├─► C   =>  A ─► C ◄─ B
   B ─┘            (DAG)
   ```
2. **契约包 + 宿主注入**：把接口/类型放进普通 npm 包（无运行时依赖）；运行时由**宿主**在 A、B 都就绪后
   互连（`A.inject(B)` / `B.inject(A)`），即显式的依赖注入编排。
3. **惰性环（仅显式开启）**：在 manifest 显式声明 `cycle: 'allow-lazy'` 时，环上的边改为**延迟求值**
   （加载时不断链，消费时经 `getRemote` 惰性取），由 Tarjan SCC 标出强连通分量并保证分量内所有 remote
   均已加载后再触发消费端回调。**默认关闭**，需评审后单列方案。

> 结论：本轮只做 **15.1 构建期检测** + **15.2 防御**；**15.3** 待确有环场景时另起文档（如 `docs/remote-dependency-cycles.md`）。
