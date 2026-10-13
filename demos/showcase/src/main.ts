import './styles/global.css';
import { createInstance } from 'linkjs';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import registry from './registry';

createInstance({
  mode: import.meta.env.PROD ? 'production' : 'development',
  devtools: false,
  shares: {
    vue: { name: 'vue', lib: () => import('vue') },
    pinia: { name: 'pinia', lib: () => import('pinia') },
    'vue-router': { name: 'vue-router', lib: () => import('vue-router') },
  },
}).loadRegistry(registry);

createApp(App).use(router).mount('#app');
