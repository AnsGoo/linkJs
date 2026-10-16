# LinkJS Showcase

深色科技感的多页示例集，展示 linkjs 的远程加载与**远程间依赖**能力。

| 页面          | 内容                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 总览          | 实时依赖拓扑图（`HOST → 远程 → 共享/远程依赖`）与能力速览                                                                                                                                                              |
| 运行时加载    | `loadApp` + `getRemote` 异步消费；含解析日志与实时状态                                                                                                                                                                 |
| 构建期 import | `import { HelloWorld } from 'remoteApp'`（虚拟模块 + `preload`）                                                                                                                                                       |
| 依赖拓扑      | 实时 SVG 依赖图 + 依赖表                                                                                                                                                                                               |
| 路由级预取    | `preloadRemote` 预热远端资源 + `remoteSnapshot`/`globalSnapshot`                                                                                                                                                       |
| 多源灰度      | 多候选源 + `first-healthy` 健康检查/回退（`sourceStrategy` 灰度）                                                                                                                                                      |
| 共享依赖协商  | 同名库 `linkkit` 多版本（宿主 v1.0.0 + 远端 v2.0.0），切换 `version-first` / `loaded-first` 实时观察 `loadShare`/`getShare` 命中；含 `eager`、`loadShareSync`、多 `shareScope`、`requiredVersion`/`strictVersion` 诊断 |
| 故障注入      | 内置插件实操：`timeout` 中止、`retry` 候补 host、`fallback` 降级、`auth` 注入 token、`logger` 指标                                                                                                                     |
| 加载生命周期  | `remote.status` 流转、`unloadRemote` 卸载/重载、路线 B `createRemoteApp` 的 `loading`/`error` 槽                                                                                                                       |
| 事件总线      | `libExpose` / `SharedExpose` / `remoteUpdate` 实时时间线 + `once` / `off` / `clear`                                                                                                                                    |
| 安全 SRI/CSP  | 静态远端的 `<script integrity>` 透传：正确哈希放行、篡改哈希被浏览器拦截；CSP nonce 透传说明                                                                                                                           |
| Shadow 隔离   | `createRemoteComponent(..., { shadow: true })` 对比全局样式渗入                                                                                                                                                        |
| 插件机制      | `RuntimePlugin` 钩子（本页注册 `demo-inspector` 实时记录钩子调用）                                                                                                                                                     |
| 类型转发      | `consumeTypes` 生成的聚合 `declare module`（`<remote>` / `<remote>/<Expose>`）                                                                                                                                         |
| HMR 热更新    | `subscribeRemoteUpdate` 订阅 `REMOTE_UPDATE`（编辑远端组件即触发）                                                                                                                                                     |
| 可观测        | `getSnapshot()` 实时视图：实例 / 依赖 / 共享 / 事件 / 诊断                                                                                                                                                             |

## 运行

需要先启动两个远程：

```bash
pnpm --filter vue-components-starter dev   # remote-lib  :4001
pnpm --filter RemoteApp dev                # remoteApp   :8081（类型 :4002）
pnpm --filter ShareRemote dev              # share-remote :8091（共享依赖协商页用）

pnpm --filter linkjs-showcase dev          # 本示例      :5190
```

打开 http://localhost:5190 。

> 设计：近黑背景 + 网格与双色辉光、Inter + JetBrains Mono、单一入场动效（拓扑描边绘制）；
> 主题化了选区、滚动条与焦点环。令牌集中在 `src/styles/global.css`。
