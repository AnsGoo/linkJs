import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { exposeLib } from 'linkjs'
import HelloWorld from './components/HelloWorld.vue'

// 暴露应用实例
exposeLib('remote', {
  HelloWorld,
  createApp: () => {
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    return app
  }
}, {
  version: '1.0.0'
})

