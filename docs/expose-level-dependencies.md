# Expose 级依赖与共享加载（细粒度）

> 状态：**讨论稿**（未实现）。
> 前提：远端导出的各 `expose`（A/B/C…）**均为 lazy**（各自独立 chunk，按需 `import()`）。
> 目标：消费 `RemoteApp/B` 时，只加载 **B 自己的** 远程依赖与共享依赖，不牵动 A/C。
> 关联：`docs/remote-dependencies.md`、`docs/remote-dependency-cycles.md`。

## 1. 现状：remote 级、整包加载

三处都按 **remote 级**处理，导致“消费 B 也会加载 A 的依赖/共享”：

1. **远程依赖**：`resolveRemoteDeps(remoteName)` 加载该远程**全部** `remotes`，与消费哪个 expose 无关（`packages/linkjs/src/loader/deps.ts`）。
2. **共享依赖**：`loadApp`/`loadLib` 加载前 `await` 预加载 `remoteInfo.shared` **全部**（`packages/linkjs/src/loader/app.ts`、`lib.ts`）。
3. **消费入口**：`createRemoteComponent('RemoteApp/B')` → `loadRemote` → `loadApp('RemoteApp')`，执行**整个入口 bundle**（A/B/C 全在）。

**例子**：RemoteApp 导出 {A,B,C}，只有 A 依赖 LibA；当前消费 B 仍会预加载 LibA 与全部 shared。

## 2. 目标语义

- 远端**入口变薄**：只注册「expose → 懒加载器」映射，**不 import A/B/C 本体**。
- 消费 `RemoteApp/B`：只加载 **B 的 chunk** + **`exposes[B].remotes`** + **`exposes[B].shared`**。

## 3. 运行时契约：惰性 expose

### 方案 a（MF 风格，推荐）
```ts
expose('remoteApp', {
  A: () => import('./chunk-A'),
  B: () => import('./chunk-B'),
  C: () => import('./chunk-C'),
});
```
- `getRemote('remoteApp/B')` 解析**惰性值**（await getter）→ 只触发 B 的 chunk。
- 入口不 import A/B/C → 天然变薄。

### 方案 b（不改 API，manifest 驱动）
- 每个 expose 是**独立入口 chunk**，chunk 内自行 `expose('remoteApp', { B })`。
- 宿主按 `manifest.exposes[B].assets` 只 `import` B 的 chunk（执行即 expose）。
- 优点：`expose` 语义不变；缺点：宿主需要「按 expose 拉 chunk」的加载路径。

> 两者都需要：**入口瘦身 + 每 expose 独立 chunk**（rollup 多入口 / `import()` 分包）。

## 3.5 方案 a 与 b 的对比

> **已定：采用方案 b（manifest 驱动 import chunk）** —— 宿主按 `manifest.exposes[<Expose>].assets` 直接 import 该 expose 的 chunk；`expose` 语义保持不变。
> 方案 a 保留为备选（记录于下）。

**核心差异一句话**：*谁持有「expose → chunk」的映射、谁主导加载*。
- 方案 a：**远端运行时**持有映射（`B: () => import('./chunk-B')`），宿主按**名字**请求 → `getRemote('r/B')` await getter；**宿主不关心 chunk 路径**。
- 方案 b：**宿主**持有映射（`manifest.exposes[B].assets`），按**URL**直接拉 chunk；chunk 执行时自暴露。

**时序**
```
方案 a：loadRemote('r/B') → 加载薄入口 → 入口 expose({B:()=>import('./chunk-B')})
        → 运行时查映射 → await getter → import chunk-B → 组件
方案 b：loadRemote('r/B') → fetch manifest → 取 exposes[B].assets → 按 URL 拉 chunk-B
        → chunk-B 执行 expose('r',{B}) → host 等 LIB_EXPOSE → 组件
```

| 维度 | 方案 a（惰性 getter） | 方案 b（manifest 驱动） |
|---|---|---|
| 映射归属 | **远端**运行时 | **宿主**（读 manifest） |
| 宿主是否知道 chunk 路径 | 不需要 | 需要（assets 清单） |
| 入口角色 | 薄入口**先注册 getter**（两步：注册→请求） | 入口更薄/无需注册；**按 URL 直接拉 chunk** |
| 加载主导权 | 远端 loader | 宿主 loader |
| 预取/预热 | 弱（路径对宿主不透明） | **强**（manifest 有 assets，可 modulepreload/prefetch） |
| SRI / CORS / 鉴权 | 宿主不便干预（远端发起） | **宿主可逐 chunk 施加**（manifest 有 integrity） |
| 诊断 / 超时 | 远端主导，较难介入 | **宿主主导，可控** |
| 与静态导入契合 | 天生契合（`import {B}` = `getRemote('r/B')` 走 getter） | 契合，但虚拟模块需依赖 manifest 路径 |
| 缓存 / 去重 | 远端 ESM 缓存 + 运行时映射 | 宿主按 URL 缓存 |
| 实现改动 | 改 `expose` 语义（支持 getter）+ `getRemote` 异步解析 | 新增“按 expose 拉脚本”加载器；约定“每 expose 自暴露”+ 入口瘦身 |
| 依赖(remotes/shared)解析 | 在 `getRemote` 时按 expose 解析 | 在拉 chunk 前按 manifest 解析 |
| App(HTML) | 偏 Lib（模块入口） | App 也可（按 expose 的 HTML/JS assets） |
| 语义参照 | Module Federation `container.get('./B')` | 传统“清单 + 脚本注入”（linkjs 现有 `loadScript/loadCss` 路线） |

**取舍**
- **方案 a**：远端自治、宿主简洁、契合远程运行时与静态导入；但 chunk 路径对宿主**不透明** → 预取/SRI/网络干预弱，且 `getRemote` 需**异步化**、远端必须真正分包。
- **方案 b**：宿主**完全掌控** → 易做预取/预热/SRI/超时诊断；linkjs **已有** `manifest.exposes[].assets`/`integrity` 数据；但**与构建产物清单强绑定**，需约定“每 expose 自暴露/入口瘦身”。

**与现状契合度**
- linkjs 已有 b 所需数据（`manifest.exposes[].assets`、`entry.assets`、`integrity`）与脚本/样式注入路径（`loadScript/loadCss/preloadModule`）→ **b 更贴近现状、改动更集中**。
- linkjs 的 `expose` 目前是 **eager** → **a 需要扩展为支持 getter**，并让 `getRemote` 支持异步解析。

**推荐（可组合）**
- **正确性用 a，性能用 b**：以 a 的惰性 getter 定义消费语义（宿主简洁、远端自治），同时用 `exposes[].assets` 做预取/预热/SRI。
- 若优先**尽快落地、少改运行时** → 先走 **b**（宿主按 manifest 拉 chunk），保持 `expose` 语义不变。
- 一句话：想**远端自治、宿主不碰路径** → a；想**宿主掌控预取/安全/诊断、改动最小** → b。

## 4. 构建期（unplugin）产物

1. **生成懒入口**（方案 a）：从 `exposes`/`exports` 生成 `A: () => import('./chunk-A')` 注册代码（方案 b：生成每 expose 独立入口）。
2. **每 expose 依赖闭包**：用模块图分析每个 expose chunk 的 import 闭包，产出（**统一字段 `deps`**）：
   ```jsonc
   exposes: [
     { name: "A", assets: {…}, deps: { remotes: { LibA: { host: "…" } }, shared: ["vue", "pinia"] } },
     { name: "B", assets: {…}, deps: { remotes: {},                      shared: ["vue"] } },
     { name: "C", assets: {…}, deps: { remotes: {},                      shared: ["vue"] } }
   ]
   ```
   ——「B 不依赖 LibA」的落点：B 的 `deps.remotes` 为空，A 的 `deps.remotes` 才有 LibA。
   （现有 `analyzeDependencies` 是**包级**闭包，需扩展为**按 expose 入口**的闭包。）

## 5. 宿主加载流程（`loadRemote('<remote>/<Expose>')`）

1. 确保远端**薄入口**已加载（注册懒映射 / 拿到 `manifest.exposes`）；
2. 读取 `exposes[Expose]`：
   - 加载其 **`deps.shared`**（仅列出的）；不再预加载 remote 级全部 shared；
   - 加载其 **`deps.remotes`**（仅列出的，走现有拓扑/去重）；不再加载 remote 级全部 remotes；
3. 触发该 expose 的 **chunk**（方案 a：调 getter；方案 b：按 assets import）；
4. 解析并渲染。

## 6. 每 expose 的依赖（`exposes[].deps`）

> **统一字段 `deps`**：`{ remotes?: Record<string,{host}>; shared?: string[] }`。

- **deps.remotes**：由 remote 级 `remotes` 细化为 `exposes[].deps.remotes`（缺失则回退 remote 级）。
- **shared（已定：② 按需，「用到才拿」）**：宿主**不做清单预加载**；由远端 chunk `import` 时触发
  `register-share` / `loadShare` —— **用到哪个才加载哪个**。宿主只需保证自身 singleton 已**注册**
  （`createInstance` 已注册），远端即命中宿主实例（`registerShare` 的 singleton 语义保证）。
  - 备选 ①（宿主按 `deps.shared` 预加载）保留，仅用于“宿主 singleton + 远端同步使用”的**最小兜底**。

### 6.1 实现要点（shared 按需）

1. **收窄/移除预加载**：`loadApp`/`loadLib` 不再 `await` 预加载 `remoteInfo.shared` **全部**
   （`packages/linkjs/src/loader/app.ts`、`lib.ts`）。改为不预加载（或仅对“关键项”做最小预加载兜底）。
2. **远端构建接运行时**：远端对 shared 的 `import` 需接到运行时加载路径 ——
   dev 走 `adaptiveRuntime` / `$linkjs`（现有 `unplugin-linkjs` 改写）；prod 走 `register-shares`
   或运行时访问器，使“import 即触发 `loadShare`”。
3. **同步访问时序**：若远端**顶层同步**使用 shared，需经 **top-level await** 或惰性引用；
   “宿主 singleton + 同步使用”的项用 ① 做**最小预加载**兜底，避免拿到 null/回退。
4. **singleton / 版本**：沿用现有策略 —— 宿主 `createInstance` 注册优先（先注册者胜出）；
   `loadShare` 的候选/版本协调不变。
5. **失败回退**：远端本地回退（`register-shares`）仍保留，宿主未提供时可用。

## 7. 与既有机制的关系（需一起改）

| 机制 | 现状 | 需改为 |
|---|---|---|
| 去重 | `remoteCache`/inflight 按 **remote** | 扩到 **expose 级**（同 expose 多消费者只 import 一次） |
| 引用计数/卸载 | remote 级 | expose 级（卸载 B 不影响同 remote 的 A/C） |
| 环检测 | remote 级图 | **expose 级**图 |
| 观测/DevTools | remotes 列表 | 列出 **exposes 及其状态/依赖** |
| 静态导入 | `RemoteApp/B` | 天然 expose 级（前提入口瘦身） |

## 8. 关键取舍 / 风险

- **App（HTML 入口）**：即使 expose lazy，app 的 HTML 入口通常仍加载 app 全局；expose 级只能约束「exposed 组件」的 chunk 与依赖。
  → 需明确「App 也 expose 级」的边界，或要求 App 用 MF 风格入口。
- **必须真正分包**：只要入口仍 `import` 了 A/B/C（或共享 chunk 合并），lazy 形同虚设 → unplugin 应**强制/校验**每 expose 独立 chunk。
- **首屏与预加载**：入口变薄后，需「hover/prefetch 预取某 expose 的 chunk」补回体验（复用 `preloadRemote` 的 assets）。
- **版本/共享协调**：按 expose 加载 shared 后，singleton「谁先注册」仍需全局一致（跨 expose/跨 remote）。

## 8.5 实现状态（截至本轮）

**已实现**
- 构建期：自动解析 `expose()` → `exposes[].name` = expose 名；`exposes[].deps = { remotes, shared }` 按**该 expose 模块闭包**计算（用 transform 记录的原始导入判定，因改写会移除裸导入）。
- 宿主：`loadRemote('<r>/<E>')` 优先用 `exposes[E].deps.remotes`（回退 remote 级）；**lib 按 `exposes[E].assets` 定向加载 chunk**。
- 共享：**按需**（远端 import 触发 `loadShare`）。
- 并发去重（按 appName）；`consumeTypes` 失败退避重试。
- 测试：`expose-parse.test.ts`、`exposes-deps.integration.test.ts`、`remote-deps.test.ts`、`preload.test.ts`。

- expose 级**引用计数**：`retainExpose/releaseExpose`（`instance.exposeRefs`）；`createRemoteComponent`
  挂载 retain / 卸载 release；快照 `exposes[].refs`。
- **DevTools**：RemoteView 展示「Exposes（含 deps + ×refs）」；`/exposes` 展示各远端 exposes。
- **demo**：remote-lib 多 expose（HelloWorld / PiniaCounter）+ e2e 冒烟。

**未实现**
- **App 内 expose 的 chunk 定向加载**（App 壳仍整入口）。
- expose 级**独立卸载**（一个远程作为整体加载；要真正独立卸载需按 expose 分包/MF remoteEntry）。
- expose `assets.js.async` 的定向预取策略。
- 分包示例/强制校验。

## 9. 决策

**已定**
1. **契约**：**方案 b（manifest 驱动 import chunk）**。
2. **数据字段**：**统一 `exposes[].deps`**（`{ remotes?: Record<string,{host}>; shared?: string[] }`）。
3. **shared 加载**：**② 按需（用到才拿）**（宿主不预加载；远端 import 触发 `loadShare`）。

**待定**
4. **分包强制性**：unplugin 对「每 expose 独立 chunk」**强制校验**还是**建议+提示**？
5. **App 边界**：是否承诺 App 也 expose 级？还是**仅 Lib** 承诺、App 保持整包？
6. **remotes 回退**：`exposes[].deps.remotes` 缺失时是否回退 remote 级 `remotes`？
