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

## 4. 构建期（unplugin）产物

1. **生成懒入口**（方案 a）：从 `exposes`/`exports` 生成 `A: () => import('./chunk-A')` 注册代码（方案 b：生成每 expose 独立入口）。
2. **每 expose 依赖闭包**：用模块图分析每个 expose chunk 的 import 闭包，产出：
   ```jsonc
   exposes: [{ name: "B", assets: {…}, remotes: {}, shared: ["vue"] }]
   ```
   ——「B 不依赖 LibA」的落点：B 的 `remotes` 为空，A 的 `remotes` 才有 LibA。
   （现有 `analyzeDependencies` 是**包级**闭包，需扩展为**按 expose 入口**的闭包。）

## 5. 宿主加载流程（`loadRemote('<remote>/<Expose>')`）

1. 确保远端**薄入口**已加载（注册懒映射 / 拿到 `manifest.exposes`）；
2. 读取 `exposes[Expose]`：
   - 加载其 **shared**（仅列出的）；不再预加载 remote 级全部 shared；
   - 加载其 **remotes**（仅列出的，走现有拓扑/去重）；不再加载 remote 级全部 remotes；
3. 触发该 expose 的 **chunk**（方案 a：调 getter；方案 b：按 assets import）；
4. 解析并渲染。

## 6. 每 expose 的 shared / remotes

- **remotes**：由 remote 级 `remotes` 细化为 `exposes[].remotes`（缺失则回退 remote 级）。
- **shared**：两种取径——
  - ① 宿主按 `exposes[].shared` **预加载**（精确可控，推荐）；
  - ② 不预加载，远端 chunk `import` 时 `register-share` **自然按需**（更省，singleton/版本协调需再确认）。
  - 建议：①为主、②兜底（远端本地回退仍可用）。

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

## 9. 待决策

1. **契约**：方案 a（惰性 getter，MF 风格）还是方案 b（manifest 驱动 import chunk）？
2. **shared 加载**：宿主按 `exposes[].shared` 预加载（①）还是远端 import 时按需 `register-share`（②）？
3. **分包强制性**：unplugin 对「每 expose 独立 chunk」**强制校验**还是**建议+提示**？
4. **App 边界**：是否承诺 App 也 expose 级？还是**仅 Lib** 承诺、App 保持整包？
5. **数据字段**：`exposes[].remotes` / `exposes[].shared`，还是统一 `exposes[].deps`？
