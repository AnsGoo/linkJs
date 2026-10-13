import type { RegistryOption } from 'linkjs';

/** 宿主已注册的共享依赖（远端加载前会被预加载，供远端复用同一实例）。 */
const shared = {
  vue: { version: '^3.5.27', scope: 'global', singleton: true },
  pinia: { version: '^3.0.4', scope: 'global', singleton: true },
  'vue-router': { version: '^5.0.1', scope: 'global', singleton: true },
};

/**
 * 只注册两个远程：remoteApp（应用）与 remote-lib（库）。
 *
 * 关键：**remoteApp 声明它依赖 remote-lib**（`remotes`），而宿主自身**不加载** remote-lib。
 * 宿主 `loadApp('remoteApp')` 时，linkjs 会先按拓扑加载 remote-lib，再加载 remoteApp。
 */
const registry: RegistryOption[] = [
  {
    name: 'remoteApp',
    type: 'app',
    host: 'http://localhost:8081',
    entry: { html: 'index.html' },
    shared,
    // 声明式远程依赖：加载 remoteApp 前先加载 remote-lib（被依赖方）。
    remotes: {
      'remote-lib': { required: true },
    },
  },
  {
    name: 'remote-lib',
    type: 'lib',
    host: 'http://localhost:4001',
    entry: { js: '/mf/lib.js', shared: '/mf/shared.js' },
    shared,
  },
];

export default registry;
