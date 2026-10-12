# LinkJS 可观测性（Observability）

> 一览 linkjs 提供的全部可观测能力：运行时 API、状态快照、诊断通道、全局入口、页内 DevTools、性能标记、加载指标、插件指标与 Chrome 扩展。

---

## 1. 运行时 API

| API | 说明 |
| --- | --- |
| `getSnapshot()` | 返回当前实例的结构化快照（见第 2 节） |
| `getDiagnostics()` / `clearDiagnostics()` / `onDiagnostic(cb)` | 诊断读取 / 清空 / 订阅 |
| `getLoadMetrics()` / `clearLoadMetrics()` | logger 插件收集的加载指标 |
| `getPerfEntries()` / `clearPerfEntries()` | 各阶段性能标记 |
| `getEvents()` / `clearEvents()` | 事件总线记录（`LIB_EXPOSE` / `SHARED_EXPOSE` / `REMOTE_UPDATE`） |
| `installDevtoolsUI()` / `uninstallDevtoolsUI()` | 手动挂载/卸载页内 DevTools |

```ts
import { getSnapshot, getDiagnostics, onDiagnostic, getLoadMetrics, getPerfEntries } from 'linkjs';
```

## 2. 状态快照 `LinkjsSnapshot`

```
LinkjsSnapshot
├─ instance: { id, name, version, mode, shareStrategy }   // id 用于多实例区分
├─ remotes: { name, displayName, type, status, host, entry, version, shareScope }[]   // displayName = manifest name
├─ shares: { scope, name, versions: { version, loaded, requiredVersion, strictVersion, eager }[] }[]
├─ conflicts: { scope, name, requiredVersion, provided[] }[]   // 谁需要 X / 谁提供 Y
├─ plugins: string[]                         // 已注册插件名
├─ availablePlugins: { name, description, enabled }[]
├─ metrics: LoadMetric[]                      // 远程加载指标（logger）
├─ perf: PerfEntry[]                          // 各阶段耗时（fetch/scripts/total/share）
├─ events: { type, time, summary }[]          // 事件总线记录（libExpose/sharedExpose/remoteUpdate）
└─ diagnostics: Diagnostic[]
```

## 3. 诊断（Diagnostics）

```ts
interface Diagnostic { level: 'warn' | 'error'; code: string; message: string; time: number; context?: Record<string, unknown>; }
```

- 内置错误码：`SHARE_VERSION_MISMATCH`、`LOAD_REMOTE_ERROR`。
- 上限 200 条；`recordDiagnostic` 同时按级别输出控制台并通知订阅者。
- 面板「诊断」区即为**错误时间线**（按时间倒序）。

## 4. 全局入口

| 全局 | 内容 |
| --- | --- |
| `globalThis.__LINKJS__` | `getSnapshot` / `remotes()` / `shares()` / `conflicts()` / `metrics()` / `perf()` / `events()` / `clearEvents` / `getDiagnostics` / `clearDiagnostics` / `onDiagnostic`，以及操作：`load(entry, opts)` / `preload(opts)` / `clearCache(name?)` / `unload(name?)` / `loadLib(entry, opts)` / `unloadLib(entry?)` / `getRemote(entry)` / `getShare(name, opts?)` / `loadShare(name, opts?)` |
| `globalThis.$linkjs.debug` | 同上 |

```js
__LINKJS__.conflicts();
__LINKJS__.preload({ name: 'remote-lib', host: 'http://localhost:4001' });
__LINKJS__.clearCache('remote');
```

## 5. 页内 DevTools 侧边栏

- **形态**：默认右侧收起为竖排 “LinkJS” 标签（可见、不占位）；点击展开为停靠侧边栏并给 `body` 加同侧内边距**推开内容**（不悬浮）。
- **分区**：远程应用 / 共享依赖 / **共享冲突** / 插件 / **指标** / **性能** / **事件** / **诊断**，展开时每秒刷新。
- **交互**：点击标签展开、「收起」折叠；**文本过滤**；**复制 JSON**；**拖拽调整宽度**；快捷键 `Alt/Option + Shift + L`。
- **操作按钮**：远程应用行提供「预取」（`preload`）与「卸载」（`unload` / `unloadLib`）。
- **多实例**：标题显示 `instance.id`（如 `linkjs-gpb3e1`）以便区分。
- **提示**：有 `error` 诊断时标签显示红点；插件显示 `已启用 / 可用`。
- **选项**：`createInstance({ devtools: true | false | { position: 'right' | 'left' } })`。
- **实现**：Vue TSX + ShadowRoot 隔离，动态 `import()` 懒加载（独立 chunk，`vue` 为外部依赖），生产不加载。

## 6. 性能标记（Perf）

用 `performance.mark/measure` 记录，`getPerfEntries()` 读取（无 `performance` 时降级为空操作）。每条含 `label`（人类可读，**用远程 manifest 名**）与 `name`（技术名）。

| 阶段名 | 含义 |
| --- | --- |
| `linkjs:load:app:<name>` | 远程应用整体加载 |
| `linkjs:load:app:<name>:fetch` | 入口 HTML fetch |
| `linkjs:load:app:<name>:scripts` | 脚本加载 |
| `linkjs:load:lib:<name>` | 远程库整体加载 |
| `linkjs:share:<name>` | **共享依赖加载**（缓存命中/并发复用不计） |

## 7. 加载指标（logger 插件）

```ts
interface LoadMetric { entry: string; kind: 'app' | 'lib' | 'remote'; host?: string; durationMs: number; status: 'loaded' | 'error'; error?: unknown; time: number; }
```

- 记录每次远程加载耗时/结果（含 retry 各次尝试）；`afterLoadShare(name, module, durationMs)` 记录共享依赖耗时。
- 控制台输出：`[linkjs] ✓ load "remote" @http://localhost:8081 (app) 358ms`、`[linkjs] ⇄ share "vue" 5ms`。
- `loggerPlugin({ log, prefix, collect })` 可自定义。

## 8. 事件总线

`on` / `once` / `off`（省略 cb 清空该事件）/ `emit` / `clear`；关键事件 `LIB_EXPOSE` / `SHARED_EXPOSE` / `REMOTE_UPDATE`；`subscribeRemoteUpdate(entry, cb)`。

## 9. Chrome DevTools 扩展

`tools/devtools-extension/`：MV3 扩展，在 DevTools 新增 “LinkJS” 面板，经 `inspectedWindow.eval` 读取页面 `__LINKJS__.getSnapshot()`。已对齐页内面板：**分区**（远程应用 / 共享依赖 / 冲突 / 插件 / 指标 / 性能 / 事件 / 诊断）、**过滤**、**复制 JSON**、显示 `instance.id`，并对每个远程提供「预取 / 卸载」操作（调用 `__LINKJS__.preload / unload / unloadLib`）。加载方式见其 README。

## 10. 存储说明（重要）

观测数据（diagnostics / metrics / perf）存储在 `globalThis` 桶（`__linkjs_diag__` / `__linkjs_load_metrics__` / `__linkjs_perf__`），
以避免打包拆分（多入口/动态 chunk）导致模块重复实例化时读、写分属不同副本。

---

## 相关源码

- `src/devtools/index.ts`：快照、诊断、全局入口（含操作）、面板挂载决策
- `src/devtools/ui.tsx`：DevTools 侧边栏（Vue TSX）
- `src/perf/index.ts`：性能标记
- `src/plugins/logger.ts`：加载指标
- `src/plugins/catalog.ts`：插件目录
- `src/event-bus/index.ts`：事件总线
- `tools/devtools-extension/`：Chrome 扩展
