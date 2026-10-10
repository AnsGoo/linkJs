import { createApp } from 'vue';
import HelloWorld from './components/HelloWorld.vue';
import { expose } from 'linkjs';

// 路线 B：子应用自带 runtime 自我挂载，宿主只提供容器。
let app: any = null;

function mount(el: HTMLElement, props: Record<string, any> = {}) {
  app = createApp(HelloWorld, props);
  app.mount(el);
}

function unmount() {
  app?.unmount();
  app = null;
}

expose('remote', { mount, unmount }, { version: '1.0.0' });

export { mount, unmount, HelloWorld };
