import type { RegistryOption } from 'linkjs';

const registryOptions: RegistryOption[] = [
  {
    name: 'remote',
    entry: {
      // dev（vite）下入口是远程开发服务器根，而不是 dist 产物：
      // dist/index.html 内的资源是绝对路径 `/assets/...`，在 dev server 根下会 404。
      html: 'index.html',
      js: 'dist/index.js',
    },
    shared: {
      vue: {
        version: '^3.5.27',
        scope: 'global',
        singleton: true,
      },
    },
    type: 'app',
    version: '1.0.0',
  },
  {
    name: 'remote-lib',
    entry: {
      // 与 demos/remote-lib/mf/manifest.json 的实际构建产物保持一致
      js: '/mf/lib.js',
      shared: '/mf/shared.js',
    },
    shared: {
      vue: {
        version: '^3.5.27',
        scope: 'global',
        singleton: true,
      },
      pinia: {
        version: '^3.0.4',
        scope: 'global',
        singleton: true,
      },
      'vue-router': {
        version: '^5.0.1',
        scope: 'global',
        singleton: true,
      },
    },
    type: 'lib',
    version: '1.0.0',
  },
];

export default registryOptions;
