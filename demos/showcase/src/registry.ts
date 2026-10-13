import type { RegistryOption } from 'linkjs';

/** 宿主已注册的共享依赖（远端加载前会被预加载，供远端复用同一实例）。 */
export const sharedDeps = {
  vue: { version: '^3.5.27', scope: 'global', singleton: true },
  pinia: { version: '^3.0.4', scope: 'global', singleton: true },
  'vue-router': { version: '^5.0.1', scope: 'global', singleton: true },
};

const registry: RegistryOption[] = [
  {
    name: 'remoteApp',
    type: 'app',
    host: 'http://localhost:8081',
    entry: { html: 'index.html' },
    shared: sharedDeps,
    // remoteApp 声明依赖 remote-lib：加载它时会先按拓扑加载 remote-lib。
    remotes: { 'remote-lib': { required: true } },
  },
  {
    name: 'remote-lib',
    type: 'lib',
    host: 'http://localhost:4001',
    entry: { js: '/mf/lib.js', shared: '/mf/shared.js' },
    shared: sharedDeps,
  },
  {
    // 多源灰度示例：首个源不可用（4999），健康检查会回退到可用源（4001）。
    name: 'remote-lib-ms',
    type: 'lib',
    entry: { js: '/mf/lib.js', shared: '/mf/shared.js' },
    shared: sharedDeps,
    sourceStrategy: 'first-healthy',
    healthCheck: { path: 'mf/manifest.json', timeout: 1200, interval: 0 },
    sources: [
      { host: 'http://localhost:4999', labels: { region: 'us', tier: 'canary' } },
      { host: 'http://localhost:4001', labels: { region: 'cn', tier: 'stable' } },
    ],
  },
];

export default registry;
