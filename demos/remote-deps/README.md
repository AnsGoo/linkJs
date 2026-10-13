# 远程间依赖 Demo（remote → remote）

演示 linkjs 的**远程间依赖**：一个远程（App）声明依赖另一个远程（Lib），
运行时按**拓扑**自动加载（先去重地加载被依赖方，再加载依赖方），并支持引用计数卸载。

- **宿主**（本工程，`remote-deps-demo`，:5180）：只调用 `loadApp('remoteApp')`。**不加载** remote-lib。
- **remoteApp**（`demos/remote`，:8081）：在 registry 中声明 `remotes: { 'remote-lib': { required: true } }`，
  暴露两个组件演示**两种消费方式**：
  - `RemoteLibSlot`：**运行时异步**——组件内 `getRemote('remote-lib/HelloWorld')`。
  - `RemoteLibStatic`：**构建期静态 import**——组件内 `import { HelloWorld } from 'remote-lib'`
    （由 `unplugin-linkjs` 的 `remoteImports` 解析为虚拟模块，且 remote-lib 在
    `consumeTypes.remotes` 声明了 `preload` 预加载）。
- **remote-lib**（`demos/remote-lib`，:4001）：暴露 `HelloWorld` 组件。

> remoteApp 的构建期消费配置见 `demos/remote/vite.config.ts`（`consumeTypes.remotes` + `remoteImports` + `remotes`）。

预期：点击「加载 remoteApp」后，`remote-lib` 会**先**被拓扑加载，随后 remoteApp 加载；
快照表格里 `remoteApp.deps = ['remote-lib']`，两者状态均为 `loaded`。

## 运行

需要同时启动 remote-lib、remoteApp 与宿主：

```bash
# 1) 远程库（:4001，watch 构建产物 mf/）
pnpm --filter vue-components-starter dev

# 2) 远程应用（:8081）
pnpm --filter RemoteApp dev

# 3) 演示宿主（:5180）
pnpm --filter remote-deps-demo dev
# 或：pnpm dev:deps
```

打开 http://localhost:5180 ，点击「加载 remoteApp」。

## 依赖声明在 registry

见 `src/registry.ts`：

```ts
{
  name: 'remoteApp',
  type: 'app',
  host: 'http://localhost:8081',
  remotes: { 'remote-lib': { required: true } }, // 声明式远程依赖
}
```

> 生产构建时，`manifest.remotes` 会由 `unplugin-linkjs` 从 `consumeTypes.remotes` 自动派生
> （见 `docs/remote-dependencies.md`）。本 demo 为最小可运行示例，直接在 registry 声明。

## 两种消费方式

| 方式 | 写法 | 说明 |
|---|---|---|
| 运行时异步 | `getRemote('remote-lib/HelloWorld')` | 挂载时按需加载；组件内（`RemoteLibSlot`）或宿主侧均可 |
| 构建期静态 import | `import { HelloWorld } from 'remote-lib'` | `remoteImports` 生成虚拟模块（`createRemoteComponent`），配合 `consumeTypes.remotes[].preload` 预加载 |

两者都建立在“remoteApp 声明依赖 remote-lib、宿主导航式拓扑加载”之上。

## 相关文档

- 设计/实现方案：`docs/remote-dependencies.md`
- 运行时解析：`packages/linkjs/src/loader/deps.ts`
- 快照字段：`remotes[].deps`
