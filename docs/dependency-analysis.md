# 依赖分析与结论（评审稿）

> 状态：**待审阅**（仅分析，不含实现）。
> 范围：linkjs 的**循环依赖**与**依赖粒度**两大问题。
> 明细文档：`docs/remote-dependency-cycles.md`、`docs/expose-level-dependencies.md`。

---

## 1. 背景：两个问题

1. **循环依赖**：A 依赖 B、B 依赖 A（remote 或 shared），在支持静态导入时可能**加载卡死**。
2. **依赖粒度粗**：RemoteApp 导出 A/B/C，只有 A 依赖 LibA；但消费 B 时**仍会加载 LibA 与全部 shared**。

---

## 2. 核心结论（Findings）

- **F1 · 静态导入本身是惰性的**：`createRemoteComponent` 在 **mount** 时才 `loadRemote`，模块 eval 不阻塞。
  → **纯静态导入不会卡**，问题出在它与“运行时 await 依赖”的组合。
- **F2 · 死锁的本质是“加载前 await 依赖”**：`loadApp(A)` 在加载 A 自身**之前**先 `await` 依赖 B；
  若 B 的模块 eval/loader 又 `await` A → 两个 Promise 互等，无超时即**永久卡死**。`loadShare` 同理。
- **F3 · 声明式 remote 环目前“不卡但半成品”**：`resolveRemoteDeps` 用 `stack` 跳过回边，不会无限递归，
  但会导致“回边一侧的依赖未就绪”。（`packages/linkjs/src/loader/deps.ts`）
- **F4 · 环会出现在多类组合**：remote↔remote、shared↔shared、shared↔remote 混合、构建期/类型期、运行时（TLA/HMR/多宿主）。
  （完整穷举见 `remote-dependency-cycles.md` §1）
- **F5 · 依赖管理是 remote 级粗粒度**：三处都按 remote 级处理 → 消费一个 expose 会拖动整包依赖与共享：
  1. `resolveRemoteDeps` 加载该 remote **全部** `remotes`；
  2. `loadApp/loadLib` 预加载 **全部** `shared`；
  3. `loadRemote('<r>/<E>')` 走**整个入口 bundle**。
- **F6 · 粒度问题的解法前提是“expose 皆 lazy”**：入口变薄 + 每 expose 独立 chunk，才能做到“只加载 B 的 chunk 与其依赖”。

---

## 3. 建议方案（分层）

### 3.1 循环依赖
- **构建期检测（先做）**：对 **remote 依赖图 / shared 依赖图 / 静态导入图** 做 SCC 环检测，**报错并打印环路径**（`A → B → A`）。build 失败、dev 告警。
- **运行时治本**：把“加载期 await 依赖”改为 **SCC 并行 + 惰性环边**（环上不 await，改为使用时解析）；模块**先 expose 身份、再补依赖**。
- **写法约束**：禁止模块顶层 `await` 跨远程；破坏环（抽第三模块 / 事件注入 / 共享包拆合）。

### 3.2 依赖粒度（expose 级）
- **数据**：manifest 增 `exposes[].remotes` / `exposes[].shared`（构建期按 expose 的 import 闭包生成）。
- **运行时契约**：惰性 expose（`expose('r', { B: () => import('./chunk-B') })`，MF 风格）。
- **宿主**：`loadRemote('<r>/<E>')` 只加载该 expose 的 chunk + 其 remotes + 其 shared。
- **配套改造**：去重/引用计数/卸载/环检测/观测从 **remote 级**下沉到 **expose 级**。

---

## 4. 分阶段建议

1. **P0 构建期环检测**（三图 + 报错路径）——立即消除“静默卡死”。
2. **P1 运行时 SCC + 惰性环边 + 超时看门狗**——让合理的环能跑、不卡。
3. **P2 expose 级依赖/共享加载**（先 **Lib + 懒入口**，再扩展 App）。
4. **P3 观测/DevTools**：expose 级状态与依赖可视化。

---

## 5. 风险与取舍

| 项 | 取舍 |
|---|---|
| App 形态 | expose 级较难（HTML 入口含 app 全局）；建议**仅 Lib 承诺**，App 保持整包 |
| 分包 | 入口若仍 `import` A/B/C，lazy 失效 → 需 unplugin **强制/校验** 每 expose 独立 chunk |
| 首屏 | 入口变薄后需 **hover/prefetch 预取**该 expose chunk 补体验 |
| 共享协调 | 按 expose 加载 shared 后，singleton「先注册者胜出」仍需全局一致 |
| 环检测网络 | 传递拉下游 manifest 有网络成本；远端未启动的边视为未知、跳过 |

---

## 6. 待决策清单（审阅重点）

### 循环依赖
1. 检测范围：remote+shared 两图，还是也含静态导入图？
2. 传递扫描：构建期是否**拉下游 manifest**（网络）以发现 `A→B→A`？
3. 策略：build **失败** 还是仅**告警**？dev 是否 fail？
4. 算法：DFS 多环，还是 Tarjan SCC？
5. 形态：只挂构建插件，还是**同时出 `linkjs check` CLI**？

### 依赖粒度（expose 级）
6. **契约（已定）**：**方案 b（manifest 驱动 import chunk）**。
7. **shared（已定）**：**② 按需（用到才拿）**——宿主不预加载，远端 import 触发 `loadShare`。
8. **字段（已定）**：统一 **`exposes[].deps`**（`{ remotes?, shared? }`）。
9. 分包：强制校验还是建议提示？（待定）
10. App 边界：是否承诺 App 也 expose 级？（待定）
11. remotes 回退：`exposes[].deps.remotes` 缺失是否回退 remote 级？（待定）

---

## 7. 参考

- `docs/remote-dependency-cycles.md`：循环依赖场景穷举 + 构建期检测细节
- `docs/expose-level-dependencies.md`：expose 级依赖与共享加载
- `docs/remote-dependencies.md`：远程间依赖实现方案
