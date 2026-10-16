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
    entry: { js: '/mf/lib.js', shared: '/mf/shared.js', css: '/mf/style.css' },
    shared: sharedDeps,
    // 多源灰度：首个源不可用（4999），健康检查回退到可用源（4001）。
    // 注意：远端 `expose` 的名字就是 'remote-lib'，故多源必须挂在本名上（别名会因 expose 名不匹配而超时）。
    host: 'http://localhost:4001',
    sourceStrategy: 'first-healthy',
    healthCheck: { path: 'mf/manifest.json', timeout: 900, interval: 30000 },
    sources: [
      { host: 'http://localhost:4999', weight: 1, labels: { region: 'us', tier: 'canary' } },
      { host: 'http://localhost:4001', weight: 3, labels: { region: 'cn', tier: 'stable' } },
    ],
  },
  {
    // 共享依赖协商演示远端：加载时注册 linkkit@2.0.0，与宿主的 linkkit@1.0.0 协商。
    name: 'shareRemote',
    type: 'app',
    host: 'http://localhost:8091',
    entry: { html: 'index.html' },
    shared: sharedDeps,
  },
];

export default registry;
