import './assets/main.css';

import registryOptions from 'runtime-registry';
import { createInstance, loadApp, overrideRemote } from 'linkjs';

const instances = createInstance({
  shares: {
    vue: {
      name: 'vue',
      lib: () => import('vue'),
    },
  },
});
instances.loadRegistry(registryOptions);

// 加载远程模块的函数
function loadRemoteModule() {
  return loadApp('remote', {
    host: 'http://localhost:8080',
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
