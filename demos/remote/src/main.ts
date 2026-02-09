import './assets/main.css';

import { exposeLib } from 'linkjs';
import HelloWorld from './components/HelloWorld.vue';

// 暴露应用实例
exposeLib(
  'remote',
  {
    HelloWorld,
  },
  {
    version: '1.0.0',
  },
);
