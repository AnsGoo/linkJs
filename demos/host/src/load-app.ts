import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

console.log('Starting host app...');

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.mount('#app');

console.log('Pinia and router installed');
