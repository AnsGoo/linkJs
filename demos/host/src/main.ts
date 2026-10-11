import './assets/main.css';

import registryOptions from 'runtime-registry';
import { createInstance, fallbackPlugin, getSnapshot, loadApp, overrideRemote, preloadRemote, retryPlugin } from 'linkjs';

const instances = createInstance({
  // 显式指定宿主模式：DEV 下子应用复用共享 runtime，PROD 下用子应用自带 runtime。
  mode: import.meta.env.PROD ? 'production' : 'development',
  // 运行时插件：先多源重试，全部失败再降级（DevTools 会列出）。
  plugin: [retryPlugin({ retries: 2 }), fallbackPlugin()],
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

// 按远程库 manifest 的 assets 预取资源（JS/CSS 预热），失败不影响主流程。
preloadRemote({
  name: 'remote-lib',
  host: 'http://localhost:4001',
  manifestUrl: 'http://localhost:4001/mf/manifest.json',
  prefetch: true,
}).catch(() => {
  /* remote-lib 未启动时忽略 */
});

// 加载远程模块的函数
function loadRemoteModule() {
  return loadApp('remote', {
    host: 'http://localhost:8080',
    sandbox: true,
    // 与 createRemoteApp 一致：预加载即启用 shadow，样式在捕获窗口内进入影子树
    shadow: true,
  })
    .then((lib) => {
      console.log('Remote module loaded:', lib);
      // 可观测：打印当前 remotes/shares/诊断快照（也可在控制台用 __LINKJS__.getSnapshot()）
      console.log('[linkjs] snapshot', getSnapshot());
    })
    .catch((error) => {
      console.error('Failed to load remote module:', error);
    })
    .finally(() => {
      import('./load-app');
    });
}

overrideRemote().finally(() => {
  loadRemoteModule();
});
