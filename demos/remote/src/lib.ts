import HelloWorld from './components/HelloWorld.vue';
import RemoteLibSlot from './components/RemoteLibSlot.vue';
import RemoteLibStatic from './components/RemoteLibStatic.vue';
import { expose, shared } from 'linkjs';

export { HelloWorld, RemoteLibSlot, RemoteLibStatic };

// 使用全局的 linkjs 实例

expose(
  'remoteApp',
  { HelloWorld, RemoteLibSlot, RemoteLibStatic },
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

