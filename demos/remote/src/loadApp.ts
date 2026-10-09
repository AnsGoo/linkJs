import './assets/main.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'linkjs';
import App from './App.vue';
import router from './router';
import * as Vue from 'vue';

console.log('Starting host app...');

// @ts-ignore
window['Vue'] = Vue;

const app = createApp(App);

console.log('App created:', app);

app.use(createPinia());
app.use(router);

console.log('Pinia and router installed');

// 独立运行时，根容器挂上作用域属性，保证被隔离的 CSS 仍然生效
document.querySelector('#app')?.setAttribute('data-linkjs-scope', 'remote');

app.mount('#app');
