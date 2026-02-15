import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import registryOptions from 'runtime-registry';

import * as Vue from 'vue';

import App from './App.vue';
import router from './router';
import { createInstance, loadApp, overrideRemote } from 'linkjs';

const instances = createInstance({
  shares: {
    vue: {
      lib: Vue,
      alias: 'Vue',
    },
  },
});
instances.loadRegistry(registryOptions);

console.log('Starting host app...');

const app = createApp(App);

console.log('App created:', app);

app.use(createPinia());
app.use(router);

console.log('Pinia and router installed');

// 加载远程模块的函数
function loadRemoteModule() {
  return loadApp('remote', {
    host: 'http://localhost:8080',
  })
    .then((lib) => {
      console.log('Remote module loaded:', lib);
      app.mount('#app');
    })
    .catch((error) => {
      console.error('Failed to load remote module:', error);
    });
}

overrideRemote().then(() => {
  loadRemoteModule();
});
