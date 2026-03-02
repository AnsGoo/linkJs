# LinkJS

一个轻量级、高性能的前端微服务框架，基于模块联邦（Module Federation）思想实现，让微前端架构变得简单高效。

## 特性

- **轻量运行时** - 核心运行时仅包含模块加载、共享依赖管理和暴露接口，无冗余功能
- **智能共享依赖** - 支持版本优先（version-first）和加载优先（loaded-first）两种共享策略，自动解决依赖冲突
- **构建时优化** - 通过 unplugin 插件在构建阶段完成代码转换和清单生成，零运行时开销
- **多框架支持** - 与框架无关，支持 Vue、React、Angular 等任意前端框架
- **TypeScript 优先** - 完整的类型支持，提供优秀的开发体验
- **插件化架构** - 支持运行时插件扩展，满足定制化需求

## 核心概念

### 1. 远程应用（Remote App）

远程应用是独立部署的微前端单元，可以暴露组件、函数或整个应用供其他应用消费。

```typescript
// remote/src/expose.ts
import HelloWorld from './components/HelloWorld.vue';

$linkjs.expose(
  'remote',
  { HelloWorld },
  { version: '0.0.0' }
);
```

### 2. 宿主应用（Host App）

宿主应用负责加载和渲染远程应用，实现微前端的集成。

```typescript
// 加载远程应用
const remoteApp = await loadApp('remote', {
  host: 'http://localhost:3001'
});

// 获取远程模块
const { HelloWorld } = await getRemote('remote/HelloWorld');
```

### 3. 共享依赖（Shared Dependencies）

自动去重和共享基础库（如 Vue、React、React-DOM），避免重复加载，保证单例模式。

```typescript
// vite.config.ts
import { unpluginLinkjs } from 'unplugin-linkjs';

export default {
  plugins: [
    unpluginLinkjs({
      shared: {
        vue: { singleton: true, requiredVersion: '^3.0.0' },
        pinia: { singleton: true }
      }
    })
  ]
};
```

## 快速开始

### 安装

```bash
# 运行时
npm install linkjs

# 构建插件
npm install -D unplugin-linkjs
```

### 配置远程应用

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { unpluginLinkjs } from 'unplugin-linkjs';

export default defineConfig({
  plugins: [
    vue(),
    unpluginLinkjs({
      generateExposeFile: true,
      exposeOptions: {
        './Button': './src/components/Button.vue',
        './utils': './src/utils/index.ts'
      },
      shared: {
        vue: { singleton: true }
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: false
  }
});
```

### 配置宿主应用

```typescript
// main.ts
import { createInstance, loadApp, getRemote } from 'linkjs';

// 创建 LinkJS 实例
const instance = createInstance({
  shareStrategy: 'version-first',
  remotes: [
    { name: 'remote', entry: 'http://localhost:3001/manifest.json' }
  ],
  shares: {
    vue: { singleton: true, lib: () => import('vue') }
  }
});

// 加载远程应用
async function init() {
  const app = await loadApp('remote');
  const { Button } = await getRemote('remote/Button');
  // 使用远程组件...
}

init();
```

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                     LinkJS 架构                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  构建时插件  │  │  运行时核心  │  │    共享运行时    │ │
│  │ unplugin    │  │  linkjs     │  │ share-runtime   │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│         ▼                ▼                   ▼          │
│  ┌──────────────────────────────────────────────────┐  │
│  │              功能模块                              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  │
│  │  │ 模块暴露 │ │ 模块加载 │ │ 依赖共享 │ │ 版本管理 │ │  │
│  │  │ expose  │ │ loader  │ │  share  │ │ version │ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 包结构

| 包名 | 说明 |
|------|------|
| `linkjs` | 核心运行时，提供模块加载、共享依赖管理等功能 |
| `unplugin-linkjs` | 构建插件，支持 Vite、Webpack、Rolldown 等构建工具 |
| `share-runtime` | 共享运行时，管理共享依赖的加载和版本协调 |

## 示例

项目包含完整的示例：

- `demos/remote` - 远程应用示例（Vue 3）
- `demos/host` - 宿主应用示例（Vue 3）
- `demos/runtime-registry` - 运行时注册表示例

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm run build

# 运行测试
pnpm run test

# 运行示例
cd demos/remote && pnpm run dev
cd demos/host && pnpm run dev
```

## 许可证

MIT
