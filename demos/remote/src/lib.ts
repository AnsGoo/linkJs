import HelloWorld from './components/HelloWorld.vue';
import { expose, shared } from 'linkjs';

export { HelloWorld };

// 使用全局的 linkjs 实例

expose(
  'remoteApp',
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

