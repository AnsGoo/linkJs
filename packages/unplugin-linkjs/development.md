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
