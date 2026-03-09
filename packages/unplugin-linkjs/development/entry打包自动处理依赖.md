# entry打包自动处理依赖
我希望在打包过程中可以自动处理依赖

以remote-lib为例，entry文件内容为：

```js
import HelloWorld from './components/HelloWorld.vue';
import { expose, shared } from 'linkjs';

// 使用全局的 linkjs 实例

expose(
  'remote-lib',
  { HelloWorld },
  {
    version: '1.0.0',
  },
);
shared(
  'remote-lib',
  {
    vue: () => import('vue'),
    pinia: () => import('pinia'),
    'vue-router': () => import('vue-router'),
  },
  {
    version: '1.0.0',
  },
);

```

最终的打包制品为:

>  `lib.js`
>  `manifest.json`
>  `vue-[hash].js`
>  `vue-router-[hash].js`
>  `pinia-[hash].js`


lib.js 文件内容如下：
```js


const { expose, shared }  = $linkjs;

const { createElementBlock} = $linjs.getShared('vue')


const HelloWorld  = {
        // hello world 的编译内容,这里只是内容
    render() {
        return createElementBlock('div', {}, ['hello world']),
    },

}

// 使用全局的 linkjs 实例

expose(
  'remote-lib',
  { HelloWorld },
  {
    version: '1.0.0',
  },
);
shared(
  'remote-lib',
  {
    vue: () => import('vue-[hash].js'),
    pinia: () => import('pinia-[hash].js'),
    'vue-router': () => import('vue-router-[hash].js')
  },
  {
    version: '1.0.0',
  },
);


```


vue-[hash].js 文件内容如下：
```js
const Vue = await $linjs.loadShared('vue');
// vue-router 的编译内容，这里只是示例
// xxxxx
```

因为vue 为entry 文件的直接依赖，因此 使用`$linjs.getShared('vue')` 来加载vue



