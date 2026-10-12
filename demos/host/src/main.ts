import './assets/main.css';

import registryOptions from 'runtime-registry';
import {
  authPlugin,
  createInstance,
  fallbackPlugin,
  loggerPlugin,
  overrideRemote,
  retryPlugin,
  timeoutPlugin,
} from 'linkjs';

const instances = createInstance({
  // 显式指定宿主模式：DEV 下子应用复用共享 runtime，PROD 下用子应用自带 runtime。
  mode: import.meta.env.PROD ? 'production' : 'development',
  // 关闭页内 DevTools 侧边栏：面板改由 Chrome DevTools 扩展（LinkJS 标签）展示，不在页面上占位。
  devtools: false,
  // 运行时插件：日志 + 多源重试 + 失败降级 + 鉴权注入 + 超时（DevTools 会列出）。
  plugin: [
    loggerPlugin(),
    timeoutPlugin({ timeout: 10000 }),
    retryPlugin({ retries: 2 }),
    fallbackPlugin(),
    authPlugin({ token: 'demo-token' }),
  ],
  // 共享依赖版本由构建期的 linkjsSharedVersions 插件注入，运行时自动补齐。
  shares: {
    vue: {
      name: 'vue',
      lib: () => import('vue'),
    },
    // 必须把 Vue 生态一并注册为共享，否则子应用 register-shares 的本地回退会被触发，
    // 从子应用 origin 拉入第二份 Vue runtime，覆盖全局 __VUE_HMR_RUNTIME__ 导致 HMR 失效。
    pinia: {
      name: 'pinia',
      lib: () => import('pinia'),
    },
    'vue-router': {
      name: 'vue-router',
      lib: () => import('vue-router'),
    },
  },
});
instances.loadRegistry(registryOptions);

// remote-lib / remoteApp 的预加载由 vite.config 的 consumeTypes.remotes[].preload 声明：
// unplugin-linkjs 构建期注入 __linkjs_preload__，createInstance 时自动 preloadRemote，无需在此手写。
// remoteApp 本身也无需在此预先 loadApp：宿主组件（createRemoteApp / remoteImports 导入的组件）
// 挂载时会各自触发 loadApp（host 同样由注入的 __linkjs_remote_hosts__ 提供）。

overrideRemote().finally(() => {
  import('./load-app');
});
