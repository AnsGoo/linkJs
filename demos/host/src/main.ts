import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { loadRemote, clearRemoteCache } from 'linkjs';

console.log('Starting host app...');

const app = createApp(App);

console.log('App created:', app);

app.use(createPinia());
app.use(router);

console.log('Pinia and router installed');

// 直接挂载应用，不等待远程模块加载
console.log('Mounting app...');
app.mount('#app');
console.log('App mounted');

// // 加载远程模块的函数
// function loadRemoteModule() {
//   console.log('Loading remote module...')
//   return loadRemote('remote', {
//     host: 'http://localhost:8080',
//   }).then((lib) => {
//     console.log('Remote module loaded:', lib)
//     // app.mount('#app')
//   }).catch((error) => {
//     console.error('Failed to load remote module:', error)
//   })
// }

// 初始加载远程模块
// loadRemoteModule()

// 处理热更新

if (import.meta.hot) {
  console.log('Hot module replacement enabled');
  import.meta.hot.accept(() => {
    console.log('Hot module replacement accepted');
    // 清除 linkjs 缓存
    clearRemoteCache('remote');
    // 热更新时重新加载远程模块
    loadRemoteModule();
  });

  import.meta.hot.dispose(() => {
    console.log('Hot module dispose');
    // 清除 linkjs 缓存
    clearRemoteCache('remote');
  });
}
