// 当模块 origin 与页面 origin 不一致，说明是被宿主（linkjs）跨域加载：暴露探针组件。
// 独立打开时不做渲染（本远端是纯被消费端，无独立界面）。
const isHosted = new URL(import.meta.url).origin !== location.origin;

if (isHosted) {
  console.log('[share-remote] loaded by host, exposing NegotiationProbe');
  import('./expose');
} else {
  const el = document.getElementById('app');
  if (el) {
    el.textContent = 'ShareRemote 是共享依赖协商演示的远端，请在 showcase(:5190) 的「共享依赖协商」页中加载。';
  }
}
