// 先注册共享依赖回退（若宿主已注册则跳过），必须在加载业务模块前执行
import './register-shares';

// 当模块的 origin 与当前页面 origin 不一致时，说明是被宿主跨域加载的：
// 只暴露组件，不自行挂载应用。否则按独立应用启动。
const isHosted = new URL(import.meta.url).origin !== location.origin;

if (isHosted) {
  console.log('[remote] loaded by host, exposing components');
  // 被宿主加载时，宿主与子应用共享同一个 Vue 单例（unplugin 在 dev 下把
  // `from 'vue'` 改写为 `$linkjs.loadShare('vue')`），Vite 的原生 SFC HMR
  // 会通过全局 __VUE_HMR_RUNTIME__ 就地重渲染宿主已挂载的实例，无需整页刷新。
  // `vite:full-reload`（配置/依赖图变化）仍由 Vite client 默认整页刷新兜底。
  import('./index.ts');
} else {
  console.log('[remote] standalone, mounting app');
  import('./loadApp');
}
