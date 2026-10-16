import './styles/global.css';
import { createInstance, registerShare, type RuntimePlugin } from 'linkjs';
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
    // 共享依赖协商演示：宿主提供 linkkit@1.0.0（非单例），
    // 远端 share-remote 加载时会注入 linkkit@2.0.0，二者进入同一注册表参与协商。
    linkkit: {
      name: 'linkkit',
      version: '1.0.0',
      scope: 'global',
      provider: 'host',
      lib: () => import('./demo-kit/v1'),
    },
    // eager：注册后立即加载（运行时近似 Module Federation 的 eager 语义）。
    'linkkit-eager': {
      name: 'linkkit-eager',
      version: '1.0.0',
      scope: 'global',
      eager: true,
      lib: () => import('./demo-kit/v1'),
    },
  },
}).loadRegistry(registry);

// 多 shareScope 演示：同名库 linkkit 在 tenant-a 作用域下另注册一个版本，与 global 隔离。
registerShare({
  linkkit: {
    name: 'linkkit',
    version: '3.0.0',
    scope: 'tenant-a',
    provider: 'host',
    lib: () => import('./demo-kit/tenant'),
  },
});

createApp(App).use(router).mount('#app');
