import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { loadRemote } from 'linkjs'

console.log('Starting host app...')

const app = createApp(App)

console.log('App created:', app)

app.use(createPinia())
app.use(router)

console.log('Pinia and router installed')


// 然后再加载远程模块
console.log('Loading remote module...')
loadRemote('remote', {
  host: 'http://localhost:8080',
}).then((lib) => {
  console.log('Remote module loaded:', lib)
  app.mount('#app')
}).catch((error) => {
  console.error('Failed to load remote module:', error)
})

