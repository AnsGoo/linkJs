# LinkJS Showcase

深色科技感的多页示例集，展示 linkjs 的远程加载与**远程间依赖**能力。

| 页面 | 内容 |
|---|---|
| 总览 | 实时依赖拓扑图（`HOST → 远程 → 共享/远程依赖`）与能力速览 |
| 运行时加载 | `loadApp` + `getRemote` 异步消费；含解析日志与实时状态 |
| 构建期 import | `import { HelloWorld } from 'remoteApp'`（虚拟模块 + `preload`） |
| 依赖拓扑 | 实时 SVG 依赖图 + 依赖表 |
| 可观测 | `getSnapshot()` 实时视图：实例 / 依赖 / 共享 / 事件 / 诊断 |

## 运行

需要先启动两个远程：

```bash
pnpm --filter vue-components-starter dev   # remote-lib  :4001
pnpm --filter RemoteApp dev                # remoteApp   :8081（类型 :4002）

pnpm --filter linkjs-showcase dev          # 本示例      :5190
```

打开 http://localhost:5190 。

> 设计：近黑背景 + 网格与双色辉光、Inter + JetBrains Mono、单一入场动效（拓扑描边绘制）；
> 主题化了选区、滚动条与焦点环。令牌集中在 `src/styles/global.css`。
