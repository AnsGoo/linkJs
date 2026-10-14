# 循环依赖（Cyclic Dependencies）专项方案

> 状态：**讨论稿**（未实现）。
> 目标：穷举 linkjs 中会因“环”出问题的场景，给出成因与分层解决方案。
> 关联：`docs/remote-dependencies.md`（远程间依赖）。

## 0. 背景

linkjs 的依赖按**载体**与**触发方式**两条轴展开，环会在不同组合下以不同方式爆炸（轻则样式/依赖缺失，重则**永久卡死**）：

- 载体：**remote**（链接远程）｜**shared**（共享 npm 模块）
- 触发：**静态导入**（`import { X } from '<remote>'` / `remoteImports`；`shared[].dependencies` 声明）｜**运行时加载**（`loadApp`/`loadLib`/`loadRemote`/`getRemote`/`loadShare`）
- 环的方向：**声明式**（manifest/registry 声明）｜**代码式**（模块 eval / mount 时主动加载）

关键结论（先给）：

- **纯静态导入不卡**：`createRemoteComponent` 在 **mount** 时才加载，模块 eval 不阻塞。
- **真正死锁来自“加载前 await 依赖”**：`loadApp(A)` 在加载 A 自身前先 `await` 依赖 B，而 B 在 eval/loader 里又 `await` A → 两个 Promise 互等。
- 声明式 remote 环目前用 `stack` 跳过回边（**不递归、不卡**），但会导致“回边一侧依赖未就绪”。

## 1. 场景穷举

### A. Remote ↔ Remote

| # | 场景 | 说明 |
|---|---|---|
| A1 | 声明式双向 | `A.remotes={B}`，`B.remotes={A}`；`loadApp(A)` 拓扑先载 B，B 又要 A |
| A2 | 声明式 + 模块顶层 await | B 模块 eval 时 `await loadRemote('A')`，A 加载前先 await B → **互等死锁** |
| A3 | 多跳环 | A→B→C→A |
| A4 | 静态导入双向 | A 构建期 `import from 'B'`，B 构建期 `import from 'A'`（remoteImports）；挂载时互相 `loadRemote` |
| A5 | 混合环 | A 声明依赖 B；B 静态导入 A 的组件（挂载触发 `loadRemote(A)`） |
| A6 | 自依赖 | `A.remotes={A}` |
| A7 | app↔lib 混合 | A(app)→B(lib)→A(app) |
| A8 | 路线 B 互挂 | A 的 `mount` 里建 B 的 `createRemoteApp` 容器，B 的 `mount` 里建 A 的容器 |
| A9 | 插件触发 | `beforeLoadRemote`/`apply` 里 `loadRemote` 对方 |
| A10 | 卸载触发 | 卸载 A 触发加载/卸载 B，B 反向操作 A |

> 对照：**菱形** A→B、A→C、B→D、C→D **不是环**，需要的是**去重**（现有 inflight），不要与环混淆。

### B. Shared ↔ Shared

| # | 场景 | 说明 |
|---|---|---|
| B1 | 包级互依 | 共享包 A peer 依赖 B，B peer 依赖 A |
| B2 | 声明环 | `shared.A.dependencies=['B']` 且 `shared.B.dependencies=['A']` |
| B3 | loader 内 await 对方 | A 的 `lib()` 里 `await loadShare('B')`，B 的 `lib()` 里 `await loadShare('A')` |
| B4 | singleton 提供方互等 | A、B 都声明同名 singleton 且互相需要对方版本 |
| B5 | 多作用域环 | scope1 的依赖指向 scope2，scope2 又指回 scope1 |
| B6 | eager 环 | `eager:true` 注册即加载，立即成环 |

### C. Shared ↔ Remote 混合

| # | 场景 | 说明 |
|---|---|---|
| C1 | shared 依赖 remote | 某 shared 包运行期依赖某 remote；该 remote 又依赖这个 shared |
| C2 | loader 加载 remote | shared 的 `lib()` 里 `loadLib/loadRemote` 一个 remote；该 remote 声明对该 shared 的依赖 |

### D. 构建期 / 类型期（不卡死，但要处理）

| # | 场景 | 说明 |
|---|---|---|
| D1 | consumeTypes 类型环 | A 的 `.d.ts` 依赖 B，B 依赖 A → tsc/聚合声明环 |
| D2 | manifest 生成环 | `remotes` / `shared.dependencies` 构建期互相引用 |
| D3 | 图/transform 环 | dependency-graph 与 unplugin 把裸导入解析成环 |

### E. 运行时 / 环境相关

| # | 场景 | 说明 |
|---|---|---|
| E1 | TLA 引起的 ESM 环 | 同一 bundle 内 A、B 模块顶层互相 `await`（静态导入放大触发） |
| E2 | HMR 环 | 远端 re-expose → 对方 `REMOTE_UPDATE` 重挂载 → 再触发 re-expose |
| E3 | 工具触发 | DevTools、快照、预取自动调用 `loadRemote/loadShare` 意外成环 |
| E4 | 多实例/多宿主 | H1 的 A 依赖 H2 的 B，B 又依赖 H1 的 A |

## 2. 成因分析（“为什么会卡死”）

- **声明式 remote 环**：`resolveRemoteDeps`（`packages/linkjs/src/loader/deps.ts`）用 `stack` 跳过回边，
  **不会无限递归**；代价是“回边一侧未就绪”。
- **真正死锁 = 加载前 `await` 依赖**：
  - `loadApp(A)` 在 `useLoadApp(A)` **之前** `await resolveDepsFor(A)`；
    B 的模块 eval 或 loader 又 `await loadRemote(A)` → A 等 B、B 等 A，两个 Promise 互等（无超时则永久卡）。
  - `loadShare` 同样会 `await` 候选 loader，环上双方都在 await。
- **静态导入是惰性的**：`createRemoteComponent`（`packages/linkjs/src/vue.ts`）在 **mount** 才 `loadRemote`，
  故“纯静态导入”不卡；**卡的是静态导入与运行时 await 的组合**（A2/A5/B3/C1/C2/E1）。

## 3. 解决方案（分层）

### 层 1：构建期强制检测（性价比最高，先做）

- 对**三类图**统一做 SCC/环检测并**报错阻断**：remote 依赖图、shared 依赖图（`shared[].dependencies`）、静态导入图（remoteImports）。
- 复用 `packages/unplugin-linkjs/src/remote-dep-graph.ts` 的 `detectRemoteDependencyCycles`（迭代 DFS，深图安全），
  扩展为 **Tarjan 输出强连通分量（SCC）**：不只“有环”，而是给出“必须并载”的 SCC 成员集合。
- 可选对接 `dpdm` / `madge` 做包级/文件级检查；`consumeTypes` 类型环单独告警（D1）。
- 产出：`build` 失败 + 明确环路径（`A -> B -> A`）。

### 层 2：运行时“SCC 并行 + 惰性环边”（治本核心）

把“先 await 完依赖再加载自身”改为：

1. 依赖图按 **SCC** 分组；
2. **同一 SCC 内并发加载**（互不等待对方 expose）；跨 SCC 才拓扑串行；
3. 环上的边**惰性化**：不在加载期 `await` 对方，而是在**首次访问**（`getRemote/getShare` 或组件 mount）时解析。

配套：**“先 expose 身份，再补依赖”**——模块 eval 尽快 `expose`（空壳/身份），依赖在使用时解析，环上双方都能先就绪。

> 本质：把“依赖解析”从**加载期 await** 降级为**使用期惰性**，环就不再互等。

### 层 3：写法 / 契约约束（长期）

- **禁止**模块顶层 `await` 跨远程的 `loadRemote/loadShare`；跨远程访问一律放 mount / 事件回调 / 懒 getter。
- **破坏环**（首选工程手段）：
  - 依赖倒置：抽一个无依赖的**第三模块/契约包**，A、B 都只依赖它；
  - 事件总线 + 注入：宿主在 A、B 都就绪后互连（`A.inject(B)` / `B.inject(A)`）；
  - 共享包环：拆/合并包，或把顶层 `import` 改为**函数内 import**（懒 require）。
- 明确 **singleton 在环中的胜出策略**（先注册者胜出），并文档化“环内可能出现部分初始化”（ESM live binding 语义）。

### 层 4：兜底与可观测

- **超时 + 明确诊断**：加载超时抛 `REMOTE_DEP_CYCLE` / `SHARE_CYCLE`，并在快照/DevTools 显示环路径与“等待中的依赖”，**杜绝静默卡死**。
- **看门狗**：记录每个 inflight 的起始时间，超时报告“谁在等谁”。
- 沿用现有：inflight 去重、环边跳过、`disposeShadowTarget` 等。

### 层 5：语义与支持级别

| 拓扑 | 支持级别 |
|---|---|
| **DAG（无环）** | 完全支持（现状） |
| **有环** | 默认**构建期阻断**；若要运行，需显式 `cycle: 'allow-lazy'` 且遵守“惰性访问”约束 |

## 4. 建议路线

1. **层 1 三图检测**（remote + shared + 静态导入）——立即消除“静默卡死”。
2. **层 2 SCC 并行 + 惰性环边**——让“合理的环（组件级互引）”能跑。
3. **层 3 约束 + 层 4 超时诊断**同步落地，**层 5 文档**收口。

## 5. 待定决策

1. **默认策略**：有环**构建期直接报错**，还是默认允许并尝试运行？
2. **运行时环边**：是否接受“**惰性解析**”（环上不 await，改为使用时解析）？需给 `loadRemote/getRemote` 增加“惰性句柄”语义。
3. **shared 环**：允许“部分初始化”（ESM live binding）并文档化，还是同样构建期阻断？
4. **诊断码**：统一 `REMOTE_DEP_CYCLE` / `SHARE_CYCLE`，还是更细的 `*_CYCLE_EDGE_SKIPPED`？

## 7. 构建期检测（细节）

### 7.1 检测的三张图

| 图 | 边来源 | 可得性 | 难点 |
|---|---|---|---|
| **① remote 依赖图** | `remotes`（registry / consumeTypes 派生 / `manifest.remotes`） | 本构建直接拿到“我声明的依赖” | 环可能在下游：`A→B→A` 需读 **B 的 manifest.remotes** → 要**传递拉取** |
| **② shared 依赖图** | `analyzeDependencies(shared)`（`shared[dep].dependencies` / package.json 闭包） | **纯本地**、零网络、最稳 | 无 |
| **③ 静态导入图** | 源码 `import … from '<remote>'` | 单项目只知道“我 import 了谁” | 跨项目看不到对方；且与 ① 高度重合 |

**建议**：②必做；①在**宿主侧/CLI**做传递图（宿主持有全部 remotes 的 host）；③并入①（静态导入本应同步进 `manifest.remotes`），不单独建图。

### 7.2 算法

- 复用 `detectRemoteDependencyCycles`（迭代式 DFS，深图安全）→ 返回环路径。
- 若要「多环 / 最小环 / 对接运行时 SCC」，升级为 **Tarjan SCC**（输出强连通分量）。
- 输出：`A → B → A`（可选附来源：`A(manifest=…)`）。

### 7.3 挂载点（时机）

- Vite：`configureServer`（dev）+ `buildStart`（build）
- Rolldown/tsdown：`buildStart`
- 统一放在**拉取 manifest 之后**（复用 consumeTypes 结果，避免二次请求）。

### 7.4 报错策略

- **build**：默认**失败**（throw），信息含环路径 + 修复建议（拆分 / 抽第三模块 / 惰性访问）。
- **dev**：默认**告警**（不阻塞）。
- 可配置：`cycleCheck: 'error' | 'warn' | 'off'`。

### 7.5 性能与鲁棒性

- 传递拉 manifest 必须**限节点数 / 限深 / 超时**；远端**未启动 → 该边视为未知、跳过**（避免假环/漏报）。
- 与 consumeTypes 的 auth / host 解析保持一致（token、`host + /manifest.json`）。

### 7.6 边界

- 只看**图结构**，与版本 / singleton 无关。
- **菱形**（A→B、A→C、B→D、C→D）不是环（去重即可）。

### 7.7 实现状态

**已实现**（`packages/unplugin-linkjs/src/index.ts` + `remote-dep-graph.ts` + `bin/linkjs-check.mjs`）：

- **① remote 依赖图** + **② shared 依赖图** 均检测（`detectRemoteDependencyCycles`，迭代 DFS，深图安全）。
- **传递扫描**：`collectRemoteDependencyGraph(roots, { fetch, timeout, maxNodes })` BFS 拉取下游 manifest；远端未起 → 视为叶子（不误报）。
- **SCC（强连通分量）**：`findStronglyConnectedComponents`（Kosaraju，迭代）/ `findCyclicComponents`；报告“需并载的强连通分量”。
- **策略**：`build` 抛错**阻断**；`dev` `console.error` 告警。
- **时机**：Vite `buildStart`(build) / `configureServer`(dev)；Rolldown `buildStart`(build)。
- **`linkjs-check` CLI**：`bin/linkjs-check.mjs --remote name=origin ...`（CI 可用，发现环 exit 1）；根脚本 `pnpm check:cycles`。
- **运行时治本**：`hasDependencyCycle` + loader 检测到环时**并行加载所有可达依赖**（去重），
  记录 `REMOTE_DEP_CYCLE` 诊断；无环保持拓扑顺序；每远程加载超时作为看门狗。
- 测试：`remote-dep-graph.test.ts` 覆盖 DAG / `A→B→A` / 不可达叶子 / SCC；`remote-deps.test.ts` 覆盖 `hasDependencyCycle`。

**未实现**：

- **③ 静态导入图**单独检测（建议并入 ①，不单做）。
- 环路径附**来源**（manifest 地址）。
- `linkjs check` 的 CLI 参数校验/多格式配置（当前为 `--remote name=origin`）。

## 8. 相关代码 / 文档

- `packages/linkjs/src/loader/deps.ts`：远程依赖拓扑解析（`stack` 环检测、inflight 去重）
- `packages/linkjs/src/share/index.ts`：`loadShare` 候选解析与加载
- `packages/linkjs/src/vue.ts`：`createRemoteComponent`（惰性 mount 加载）
- `packages/unplugin-linkjs/src/remote-dep-graph.ts`：`detectRemoteDependencyCycles`
- `packages/unplugin-linkjs/src/dependency-graph.ts`：构建期依赖图
- `docs/remote-dependencies.md`：远程间依赖实现方案
- `docs/expose-level-dependencies.md`：expose 级依赖与共享加载（细粒度）
