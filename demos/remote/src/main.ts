// 先注册共享依赖回退（若宿主已注册则跳过），必须在加载业务模块前执行
import './register-shares';

// 当模块的 origin 与当前页面 origin 不一致时，说明是被宿主跨域加载的：
// 只暴露组件，不自行挂载应用。否则按独立应用启动。
const isHosted = new URL(import.meta.url).origin !== location.origin;

if (isHosted) {
  console.log('[remote] loaded by host, exposing components');
  // 被宿主动态加载时，子应用的模块不在宿主 Vite 的模块图内，
  // SFC 的原地 HMR 无法作用到宿主已解析的组件实例上。
  // 因此子应用有更新时直接刷新宿主页面，保证开发模式下能立即看到最新代码。
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      console.log('[remote] updated, reloading host');
      location.reload();
    });
  }
  import('./index.ts');
} else {
  console.log('[remote] standalone, mounting app');
  import('./loadApp');
}
