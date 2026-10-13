import './styles/global.css';
import { createInstance, type RuntimePlugin } from 'linkjs';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import registry from './registry';

/** 演示插件：把各生命周期钩子记录到全局环形缓冲，供「插件机制」示例页展示。 */
export interface HookRecord {
  t: number;
  hook: string;
  detail: string;
}
const hookLog: HookRecord[] = [];
(globalThis as { __linkjsHooks?: HookRecord[] }).__linkjsHooks = hookLog;
function rec(hook: string, detail = ''): void {
  hookLog.unshift({ t: Date.now(), hook, detail });
  if (hookLog.length > 200) hookLog.pop();
}

const demoPlugin: RuntimePlugin = {
  name: 'demo-inspector',
  beforeLoadRemote: (info) => void rec('beforeLoadRemote', info.name),
  afterResolve: (info) => void rec('afterResolve', info.name),
  beforeLoadContainer: (info) => void rec('beforeLoadContainer', info.name),
  beforeLoadEntry: (info) => void rec('beforeLoadEntry', info.name),
  afterLoadEntry: (info) => void rec('afterLoadEntry', info.name),
  onLoad: ({ appName }) => void rec('onLoad', appName),
  afterLoadRemote: (info) => void rec('afterLoadRemote', info.name),
  errorLoadRemote: (_error, info) => void rec('errorLoadRemote', info.name),
  beforeLoadShare: (name) => void rec('beforeLoadShare', name),
  afterLoadShare: (name) => void rec('afterLoadShare', name),
};

createInstance({
  mode: import.meta.env.PROD ? 'production' : 'development',
  devtools: false,
  plugin: demoPlugin,
  shares: {
    vue: { name: 'vue', lib: () => import('vue') },
    pinia: { name: 'pinia', lib: () => import('pinia') },
    'vue-router': { name: 'vue-router', lib: () => import('vue-router') },
  },
}).loadRegistry(registry);

createApp(App).use(router).mount('#app');
