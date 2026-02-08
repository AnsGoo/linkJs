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

### exposeLib(libName, lib, options)

暴露模块，供其他应用使用。

- `libName`: 模块名称
- `lib`: 模块实例
- `options`: 模块选项

```typescript
import { exposeLib } from 'linkjs';

// 暴露一个工具库
exposeLib(
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
exposeLib('Button', ButtonComponent, {
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

## 工作原理

1. **模块暴露**：子应用通过 `exposeLib` 函数暴露模块，内部会触发 `LIB_EXPOSE` 事件。
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
import { exposeLib } from 'linkjs';

// 暴露应用实例
exposeLib(
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
