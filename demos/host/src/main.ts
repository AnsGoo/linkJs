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

// 直接挂载应用，不等待远程模块加载
console.log('Mounting app...')
app.mount('#app')
console.log('App mounted')

// 然后再加载远程模块
console.log('Loading remote module...')
loadRemote('http://localhost:8080', {
  name: 'remote',
}).then((lib) => {
  console.log('Remote module loaded:', lib)
}).catch((error) => {
  console.error('Failed to load remote module:', error)
})


