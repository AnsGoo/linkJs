import './assets/main.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'linkjs';
import App from './App.vue';
import router from './router';
import * as Vue from 'vue';

(window as Window & { Vue?: typeof Vue }).Vue = Vue;

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
