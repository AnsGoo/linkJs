unplugin-linkjs 是linkJs的unplugin插件，我需要实现如下功能

## 生成独立依赖包

当我在配置项中配置了共享依赖时我希望可以将共享依赖打包成独立文件

例如：

```ts
import * as Vue from 'vue';


shared: {
  vue: {
    lib: Vue,
    scope: 'global',
    singleton: true,
  },
  'vue-router': {
    lib: () => import('vue-router'),
    scope: 'global',
    singleton: true,
  },
}
```

我希望最终可以生成一个shared文件，文件内容如下：

```ts
import * as Vue from 'vue';
const VueRouter = () => import('vue-router');
export default {
  Vue,
  VueRouter,
};
```

export 的导出需要满足如下要求

- 例如vue， 则首单词大写即可
- 但是vue-router 则以中划线分隔，首单词大写，并最终拼接，最终导出变量为 VueRouter

最终的制品要求，如果是同步导入的共享依赖， 希望可以同步导入，如果是异步导入的共享依赖， 希望可以依赖可以单独生成一个文件，并被异步导入



## manifest.json 文件

manifest.json 文件是一个json文件，用于描述linkjs制品的元数据文件

manifest.json 文件需要包含如下字段

- name
  - string: 制品的名称
- version
  - string: 制品的版本号
- description
  - string: 制品的描述
- entry
  - js: 制品的js输入文件路径
  - css: 制品的css输入文件路径
  - html: 制品的html输入文件路径
  - i18n: 制品的i18n输入文件路径
  - shared: 制品的共享依赖文件路径
- expose
  - 制品的导出项
- shared
  - 制品的共享依赖项, 格式为json, 例如：
  ```json
  {
    "vue": {
      "version": "3",
      "scope": "global",
      "singleton": true
    },
    "vue-router": {
      "version": "4",
      "scope": "global",
      "singleton": true
    }
  }
  ```
  其中version为共享依赖的版本号，scope为共享依赖的作用域，singleton为是否为单例模式，默认值为false， key为共享依赖的名称


## 生成linkjs enrty文件

想将linkjs 制品的entry 文件自动化

以remote-lib 为例， 我希望可以将remote-lib 的entry 文件自动化生成为 expose.ts



例如：

如果我的打包文件为 lib.ts, 我希望可以将lib.ts 自动化生成为 expose.ts

内容为

```ts
import * as lib from './lib';
import { expose } from 'linkjs';

// 使用全局的 linkjs 实例

expose(
  'remote-lib',
  lib,
  {
    version: '1.0.0',
  },
);
```

然后进行重新打包入口增加为两个， 分别为 expose.ts 和 lib.ts

lib.ts 为打包出来的正常的NPM制品，expose.ts 为打包出来的linkjs 制品文件


