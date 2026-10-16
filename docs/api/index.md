# API 参考

> 占位页（H1.7）：手工整理核心导出，后续接 typedoc（F1）。

## 核心（`linkjs`）

| API                                              | 说明                                                           |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `createInstance(options)`                        | 创建/初始化 linkjs 实例（shares / remotes / plugins / mode）。 |
| `loadApp(entry, options?)`                       | 加载远程应用（HTML 入口）。                                    |
| `loadLib(entry, options?)`                       | 加载远程库（JS 入口）。                                        |
| `loadRemote(entry, options?)`                    | 按注册类型分发到 `loadApp` / `loadLib`。                       |
| `getRemote(entry)`                               | 读取已加载的远程模块（同步）。                                 |
| `preloadRemote(options)`                         | 预取 manifest 与 `entry.assets`。                              |
| `registerRemote(config)`                         | 注册远程（name / entry）。                                     |
| `unloadRemote(name?)` / `unloadLib(entry?)`      | 卸载并清理注入资源。                                           |
| `expose(name, module, options?)`                 | 远程侧暴露模块。                                               |
| `createInstance` / `registerShare` / `loadShare` | 共享依赖。                                                     |
| `getSnapshot()` / `getDiagnostics()`             | 可观测快照 / 诊断。                                            |

## Vue 适配（`linkjs/vue`）

| API                                      | 说明                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `createRemoteApp(entry, options?)`       | 路线 B：子应用自挂载容器组件（支持 `shadow` / `loading` / `error`）。 |
| `createRemoteComponent(entry, options?)` | 路线 A：一行获取远程组件（加载 + 隔离 + HMR）。                       |
| `useRemoteModule(entry, options?)`       | 路线 A：响应式 `ShallowRef<Component>`。                              |
| `LinkjsShadowRoot`                       | 把宿主自渲染内容放进远程影子树（手动）。                              |

## 构建插件（`unplugin-linkjs`）

| 配置                          | 说明                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `consumeTypes.remotes[]`      | 拉取远程类型 + `preload` + `host` 覆盖。                       |
| `remoteImports`               | 开启 `import { X } from '<remote>'`（仅对 `preload` 的远程）。 |
| `unpluginLinkjs.vueOptions()` | 为 vue/rolldown 插件补充 per-app scoped id。                   |
| `linkjsSharedVersions()`      | 注入共享依赖版本。                                             |

> 完整签名与示例见后续 typedoc 生成页。
