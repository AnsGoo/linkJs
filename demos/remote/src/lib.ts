import HelloWorld from './components/HelloWorld.vue';
import { expose } from 'linkjs';

// 使用全局的 linkjs 实例

expose(
  'remote-lib',
  { HelloWorld },
  {
    version: '1.0.0',
  },
);

export { HelloWorld };
