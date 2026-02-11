import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import * as Vue from 'vue';

import App from './App.vue';
import router from './router';
import { loadRemote } from 'linkjs';

//@ts-ignore
window['Vue'] = Vue;

console.log('Starting host app...');

const app = createApp(App);

console.log('App created:', app);

app.use(createPinia());
app.use(router);

console.log('Pinia and router installed');

// 加载远程模块的函数
function loadRemoteModule() {
  console.log('Loading remote module...');
  return loadRemote('remote', {
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

// 初始加载远程模块
loadRemoteModule();
