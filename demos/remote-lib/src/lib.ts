import HelloWorld from './VerySimpleComponent.vue';
import PiniaCounter from './PiniaCounter.vue';
import { expose, shared } from 'linkjs';

export { HelloWorld, PiniaCounter };

// 使用全局的 linkjs 实例
// 两个 expose 的依赖不同：HelloWorld 仅 vue；PiniaCounter 还用到 pinia → 演示 expose 级 deps。
expose(
  'remote-lib',
  { HelloWorld, PiniaCounter },
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
