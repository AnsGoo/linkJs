import './assets/main.css';

import registryOptions from 'runtime-registry';
import { createInstance, loadApp, overrideRemote } from 'linkjs';

const instances = createInstance({
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

// 加载远程模块的函数
function loadRemoteModule() {
  return loadApp('remote', {
    host: 'http://localhost:8081',
    sandbox: true,
  })
    .then((lib) => {
      console.log('Remote module loaded:', lib);
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
