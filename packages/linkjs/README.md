# Linkjs

Linkjs 是一个基于事件模块的微前端框架，可以实现微应用之间的通信和动态加载。

## 特性

- 基于事件总线的通信机制
- 动态加载远程模块
- 支持 HTML 解析和资源加载
- 简单易用的 API

## 安装

```bash
# 使用 pnpm
pnpm add linkjs

# 使用 npm
npm install linkjs

# 使用 yarn
yarn add linkjs
```

## 核心 API

### getLinkInstance()

获取 Linkjs 实例，包含事件总线和应用管理方法。

```typescript
import { getLinkInstance } from 'linkjs';

const linkInstance = getLinkInstance();
// 使用 linkInstance.eventBus 进行事件通信
// 使用 linkInstance 的应用管理方法
```

### expose(libName, lib, options)

暴露模块，供其他应用使用。

- `libName`: 模块名称
- `lib`: 模块实例
- `options`: 模块选项

```typescript
import { expose } from 'linkjs';

// 暴露一个工具库
expose(
  'utils',
  {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
  },
  {
    version: '1.0.0',
  },
);

// 暴露一个 React 组件
expose('Button', ButtonComponent, {
  framework: 'react',
});
```

### loadRemote(url, options)

加载远程模块。

- `url`: 远程模块的 HTML 地址
- `options`: 加载选项

```typescript
import { loadRemote } from 'linkjs';

// 加载远程模块
loadRemote('http://example.com/remote-app/index.html', {
  name: 'remote-app',
})
  .then((remoteLib) => {
    // 使用远程模块
    console.log('Remote module loaded:', remoteLib);
  })
  .catch((error) => {
    console.error('Failed to load remote module:', error);
  });
```

### CDN 动态基址（`getPublicPath`）

远程资源（HTML / JS / CSS / 共享入口）默认基于注册的 `host` 解析。需要 CDN 或运行时
自解析基址时，可声明动态解析器（`createInstance({ getPublicPath })` 为全局默认，
`registerRemote({ getPublicPath })` 为单个远程覆盖）：

```typescript
import { createInstance } from 'linkjs';

createInstance({
  remotes: [
    {
      name: 'remoteApp',
      entry: { html: 'index.html' },
      // 按运行时上下文自解析 CDN 基址（可异步）
      getPublicPath: ({ appName, host }) => `https://cdn.example.com/${appName}/`,
    },
  ],
  // 全局兜底：未单独配置的远程统一走 CDN
  getPublicPath: ({ appName, defaultPublicPath }) =>
    appName.startsWith('cdn-') ? `https://cdn.example.com/${appName}/` : defaultPublicPath,
});
```

基址解析优先级：调用方 `host` > 远程 `getPublicPath` > 远程静态 `publicPath` >
实例 `getPublicPath` > 注册的 `host` > 当前页面 origin。静态 `publicPath` 亦可由
构建期（unplugin `publicPath` 选项）或远程 `manifest.json` 声明。

### 运行时快照（`remoteSnapshot` / `globalSnapshot`）

在预取或加载前查询「是否已加载 / 已预取」，避免重复请求：

```typescript
import { preloadRemote, remoteSnapshot, globalSnapshot } from 'linkjs';

// 单个远程：加载状态 + 预取情况
const snap = remoteSnapshot('remoteApp');
// { name, status: 'unloaded'|'loading'|'loaded', prefetched, manifestUrl, assets, ... }
if (!snap?.prefetched && snap?.status !== 'loaded') {
  await preloadRemote({ name: 'remoteApp' }); // 已预取/已加载时内部会自动跳过
}

// 全局：所有已注册 + 已预取远程汇总，带 version（每次预取缓存变更自增）
const all = globalSnapshot();
```

`preloadRemote` 预取前会自动查询快照：命中去重键（`name` 或 `manifestUrl`）或远程已 `LOADED` 时直接复用，跳过网络；`force: true` 可强制刷新。

### 多源 + 健康检查 / 灰度（`sources`）

为远程声明多个候选源，运行时按策略选择（`first-healthy` 或按权重灰度），并带健康检查：

```typescript
import { createInstance } from 'linkjs';

createInstance({
  remotes: [
    {
      name: 'remoteApp',
      entry: { html: 'index.html' },
      sources: [
        { host: 'https://primary.example.com' },
        { host: 'https://backup.example.com' }, // 主源不健康时回退
      ],
      sourceStrategy: 'first-healthy', // 默认
      healthCheck: { path: 'manifest.json', timeout: 3000, interval: 30000 },
    },
    {
      name: 'canaryApp',
      entry: { html: 'index.html' },
      sourceStrategy: 'weighted', // 灰度：按权重随机
      sources: [
        { host: 'https://stable.example.com', weight: 9 },
        { host: 'https://canary.example.com', weight: 1 },
      ],
    },
  ],
});
```

选择逻辑：`resolvePublicPath`（`loadApp`/`loadLib` 入口基址）与 `preloadRemote`（manifest 地址）在缺省 host 时都先做源选择。健康结果按 `healthCheck.interval` 缓存；可用 `selectRemoteSource(info, name, { skipHealthCheck, random })` 手动选择（`clearHealthCache()` 清缓存）。`manifest.json` 同样可声明 `sources`。

### 首屏同步取共享依赖（`loadShareSync`）

首屏渲染需要**同步**拿到已加载的共享实例时使用（避免 await）：

```typescript
import { loadShareSync } from 'linkjs';

const vue = loadShareSync('vue'); // 已加载则直接返回，否则尝试同步工厂
if (!vue) {
  // 尚未加载：改用异步 loadShare('vue')
}
```

解析顺序：已加载实例优先 → 候选的同步工厂（`() => Module`）同步求值并缓存 → 若只能异步加载（`() => Promise<Module>`）则抛错。无声明返回 `null`；版本范围 / `strictVersion` 与 `loadShare` 一致。

## 工作原理

1. **模块暴露**：子应用通过 `expose` 函数暴露模块，内部会触发 `LIB_EXPOSE` 事件。
2. **模块加载**：主应用通过 `loadRemote` 函数加载远程模块，内部会：
   - 加载远程 HTML 文件
   - 解析 HTML，提取并加载 CSS 和 JS 资源
   - 监听子应用的 `LIB_EXPOSE` 事件
   - 当子应用暴露模块时，返回模块实例

## 应用管理

Linkjs 实例提供了应用管理方法：

```typescript
const linkInstance = getLinkInstance();

// 注册应用
linkInstance.registerApp('app1', appInstance);

// 获取应用
const app = linkInstance.getApp('app1');

// 注销应用
linkInstance.unregisterApp('app1');

// 注册库
linkInstance.registerLib('utils', utilsLib);

// 获取库
const utils = linkInstance.getLib('utils');

// 注销库
linkInstance.unregisterLib('utils');

// 初始化
linkInstance.init();

// 销毁
linkInstance.destroy();
```

## 事件通信

Linkjs 使用事件总线进行通信：

```typescript
const linkInstance = getLinkInstance();

// 监听事件
linkInstance.eventBus.on('custom-event', (data) => {
  console.log('Custom event received:', data);
});

// 触发事件
linkInstance.eventBus.emit('custom-event', { message: 'Hello Linkjs!' });

// 移除事件监听器
const handler = (data) => console.log(data);
linkInstance.eventBus.on('event', handler);
linkInstance.eventBus.off('event', handler);
```

## 示例

### 主应用

```typescript
import { loadRemote } from 'linkjs';

// 加载远程子应用
loadRemote('http://localhost:3001/index.html', {
  name: 'remote-app',
}).then((remoteApp) => {
  console.log('Remote app loaded:', remoteApp);
  // 使用远程应用
  remoteApp.mount('#app-container');
});
```

### 子应用

```typescript
import { expose } from 'linkjs';

// 暴露应用实例
expose(
  'remote-app',
  {
    mount: (container) => {
      console.log('Mounting remote app to:', container);
      // 挂载逻辑
    },
    unmount: () => {
      console.log('Unmounting remote app');
      // 卸载逻辑
    },
  },
  {
    version: '1.0.0',
    author: 'Linkjs Team',
  },
);
```

## 开发

- 安装依赖：

```bash
pnpm install
```

- 运行测试：

```bash
pnpm test
```

- 构建库：

```bash
pnpm build
```

## 许可证

ISC
