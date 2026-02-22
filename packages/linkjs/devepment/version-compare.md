# 版本比较工具设计文档

## 概述

开发一个版本比较工具，用于linkjs的可以正确获取到共享的版本号，可以使用semver包辅助对比NPM包的版本，当调用getShare和LoadShare时，根据如下原则获取版本最新的Module

## 版本优先策略（version-first）

### getShare 行为规则

1. 当getShare 未指定版本的时候，默认取已经加载的Module，如果未加载则返回null
2. 如果加载了多个版本，当getShare 指定了版本的时候，默认满足版本要求且已经加载的的最新版本的Module
3. 当getShare 指定了版本但是版本不匹配任何已加载的版本时，默认返回null

### loadShare 行为规则

4. 当loadShare 指定了版本但是版本不匹配任何已共享的版本时，默认返回null
5. 当loadShare 未指定版本时，默认返回已加载的Module，如果未加载任何版本，则加载已共享的最新版本
6. 当loadShare 指定了版本时，已加载的版本中存在匹配的版本时，默认返回已加载的Module
7. 当loadShare 指定了版本时，已加载的版本中不存在匹配的版本时，但是未加载的版本存在匹配的版本时，默认加载匹配的版本，并返回相关Module
8. 当loadShare 指定了版本时，已加载的版本中不存在匹配的版本时，且未加载的版本也不存在匹配的版本时，默认返回null

## 已加载优先策略（loaded-first）

### loadShare 行为规则

1. 当shareStrategy 为loaded-first时，loadShare默认先使用已加载的Module，如果未加载任何版本，则加载已共享的最新版本
2. 当shareStrategy 为loaded-first时，如果指定了版本且已加载版本中存在匹配的版本，优先返回已加载的Module
3. 当shareStrategy 为loaded-first时，如果指定了版本但已加载版本中不存在匹配的版本，则加载匹配的版本

### getShare 行为规则

1. 当shareStrategy 为loaded-first时，getShare默认先使用已加载的Module，如果未加载任何版本，则返回null
2. 当shareStrategy 为loaded-first时，如果指定了版本且已加载版本中存在匹配的版本，返回满足版本要求的已加载的最新版本
3. 当shareStrategy 为loaded-first时，如果指定了版本但已加载版本中不存在匹配的版本，返回null

## 配置选项

### registerShare 配置

```typescript
interface ShareOption {
  name: string;           // 共享模块名称
  version?: string;        // 模块版本号
  lib: Module | (() => Promise<Module>) | (() => Module);  // 模块内容或加载函数
  scope?: string;         // 作用域，默认为 'global'
  singleton?: boolean;    // 是否为单例模式
}
```

### 全局配置

```typescript
interface ShareConfig {
  strategy?: 'version-first' | 'loaded-first';  // 共享策略，默认为 'version-first'
}
```

## 版本范围语法

使用 semver 包支持的版本范围语法：

- `^1.2.3` - 兼容 1.2.3 及以上版本，但不包括 2.0.0
- `~1.2.3` - 兼容 1.2.3 到 1.2.x 的补丁版本
- `>=1.2.3` - 大于或等于 1.2.3
- `>1.2.3` - 大于 1.2.3
- `1.2.3 - 1.2.5` - 版本范围
- `*` - 任意版本

## 使用示例

### 基本使用

```typescript
import { registerShare, loadShare, getShare } from 'linkjs';

// 注册共享模块
registerShare({
  'lodash': {
    version: '4.17.21',
    lib: () => import('lodash'),
  },
  'lodash': {
    version: '4.17.20',
    lib: () => import('lodash'),
  },
});

// 加载共享模块（默认版本优先策略）
const lodash = await loadShare('lodash');

// 获取已加载的模块
const loadedLodash = getShare('lodash');
```

### 指定版本加载

```typescript
// 加载特定版本范围的模块
const lodash = await loadShare('lodash', { version: '^4.17.0' });

// 获取特定版本的模块
const loadedLodash = getShare('lodash', { version: '4.17.21' });
```

### 使用作用域

```typescript
// 在不同作用域中注册和加载模块
registerShare({
  'lodash': {
    version: '4.17.21',
    lib: () => import('lodash'),
    scope: 'app1',
  },
});

// 从特定作用域加载模块
const lodash = await loadShare('lodash', { scope: 'app1' });
```

### 动态加载

```typescript
// 使用函数动态加载模块
registerShare({
  'react': {
    version: '18.2.0',
    lib: async () => {
      const React = await import('react');
      return React.default;
    },
  },
});

const react = await loadShare('react');
```

## 版本比较器 API

### VersionComparator.findBestMatch

在已加载版本和可用版本中查找最佳匹配的版本。

```typescript
const bestMatch = VersionComparator.findBestMatch(
  '^1.2.0',           // 版本范围
  loadedVersions,          // 已加载的版本列表
  availableVersions        // 可用的版本列表
);
```

### VersionComparator.findLatestVersion

查找版本列表中的最新版本。

```typescript
const latest = VersionComparator.findLatestVersion([
  { version: '1.0.0', module: module1 },
  { version: '1.2.0', module: module2 },
  { version: '2.0.0', module: module3 },
]);
```

### VersionComparator.satisfiesVersion

检查版本是否满足指定的版本范围。

```typescript
const isSatisfied = VersionComparator.satisfiesVersion('1.2.3', '^1.2.0');
```

### VersionComparator.isValidVersion

验证版本号是否有效。

```typescript
const isValid = VersionComparator.isValidVersion('1.2.3');
```

## 实现细节

### 版本存储结构

已加载的模块使用以下格式存储：

```typescript
// sharedMap: Map<scope, Map<versionKey, Module>>
// versionKey 格式: "${moduleName}@${version}"
// 例如: "lodash@4.17.21"
```

### 版本匹配优先级

1. **精确匹配** - 完全匹配指定的版本号
2. **范围匹配** - 满足版本范围要求的最高版本
3. **最新版本** - 在没有版本要求时，选择版本号最大的版本

### 单例模式

当 `singleton: true` 时，同一个模块名称只能注册一个版本，后续注册会被忽略。

## 性能优化

1. **缓存已加载模块** - 避免重复加载相同版本的模块
2. **版本索引** - 使用 `@` 分隔符快速查找已加载的版本
3. **延迟加载** - 只有在需要时才加载模块内容
4. **版本预解析** - 使用 semver 的 coerce 函数预处理版本号

## 注意事项

1. **版本号格式** - 建议使用语义化版本号（Semantic Versioning）
2. **版本范围** - 使用清晰的版本范围表达式，避免歧义
3. **作用域隔离** - 不同作用域的模块互不影响
4. **内存管理** - 及时清理不再使用的模块，避免内存泄漏
5. **错误处理** - 处理模块加载失败的情况，提供友好的错误信息
