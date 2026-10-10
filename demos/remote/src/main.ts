// 先注册共享依赖回退（若宿主已注册则跳过），必须在加载业务模块前执行
import './register-shares';

// 当模块的 origin 与当前页面 origin 不一致时，说明是被宿主跨域加载的：
// 只暴露组件，不自行挂载应用。否则按独立应用启动。
const isHosted = new URL(import.meta.url).origin !== location.origin;

if (isHosted) {
  console.log('[remote] loaded by host, exposing components');
  import('./index.ts');
} else {
  console.log('[remote] standalone, mounting app');
  import('./loadApp');
}
