export { default as HelloWorld } from './VerySimpleComponent.vue'
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
