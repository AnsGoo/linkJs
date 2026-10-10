import { expose, loadRuntime } from 'linkjs';

// 路线 B：子应用自带 runtime 自我挂载，宿主只提供容器。
// 关键：先解析框架 runtime，再动态导入组件，保证组件求值时真实的
// __VUE_HMR_RUNTIME__ 已就绪（宿主 DEV 复用共享；宿主 PROD 用子应用自带），
// createRecord 才会落到同一个 runtime，HMR 才能就地重渲染。
let app: any = null;

async function mount(el: HTMLElement, props: Record<string, any> = {}) {
  const { createApp } = await loadRuntime('vue', () => import('vue'));
  const { default: HelloWorld } = await import('./components/HelloWorld.vue');
  app = createApp(HelloWorld, props);
  app.mount(el);
}

function unmount() {
  app?.unmount();
  app = null;
}

expose('remote', { mount, unmount }, { version: '1.0.0' });

export { mount, unmount };
