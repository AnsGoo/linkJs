import { createInstance } from 'linkjs';
import { createApp } from 'vue';
import App from './App.vue';
import registry from './registry';

// 宿主共享依赖（与其它 demo 一致）：DEV 下子应用复用宿主 runtime。
createInstance({
  mode: import.meta.env.PROD ? 'production' : 'development',
  devtools: false,
  shares: {
    vue: { name: 'vue', lib: () => import('vue') },
    pinia: { name: 'pinia', lib: () => import('pinia') },
    'vue-router': { name: 'vue-router', lib: () => import('vue-router') },
  },
}).loadRegistry(registry);

createApp(App).mount('#app');
