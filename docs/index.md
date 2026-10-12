---
layout: home

hero:
  name: LinkJS
  text: 微前端运行时
  tagline: 远程加载 · 共享依赖 · Shadow 隔离 · 类型转发
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/

features:
  - title: 路线 A / 路线 B
    details: 构建期 `import` 或运行时 `createRemoteApp` / `createRemoteComponent`，按场景选择。
  - title: Shadow 样式隔离
    details: 影子树原生 CSS 隔离，构建期捕获、并发加载，dev 与 build 行为一致。
  - title: 类型转发
    details: 构建期 `consumeTypes` 拉取远程 `.d.ts`，远程组件静态 import 全类型。
  - title: 共享依赖
    details: 版本协商 + 多 shareScope，Vue 生态单实例，支持自适应 runtime。
  - title: 预加载与清单
    details: manifest `entry.assets` + `preloadRemote`，可构建期声明自动预加载。
  - title: 可观测
    details: 快照 / 诊断通道 / 性能标记 / DevTools 面板与 Chrome 扩展。
---
