import { createApp } from 'vue';
import HelloWorld from './components/HelloWorld.vue';
import RemoteLibSlot from './components/RemoteLibSlot.vue';
import RemoteLibStatic from './components/RemoteLibStatic.vue';
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

// 同时暴露组件，供宿主用 getRemote('remoteApp/<Expose>') 消费（路线 A）。
expose('remoteApp', { mount, unmount, HelloWorld, RemoteLibSlot, RemoteLibStatic }, { version: '1.0.0' });

// 远端组件热更新时**重新 expose**：linkjs 检测到已缓存模块再次暴露，会广播 REMOTE_UPDATE，
// 宿主（subscribeRemoteUpdate）即可感知。
// 说明：Vue SFC 会自我 accept（组件级 HMR），因此 `accept(dep, cb)` 不会触发；
// 这里监听 Vite 的 `vite:afterUpdate`（任意 HMR 更新后）来重新 expose。
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    expose('remoteApp', { mount, unmount, HelloWorld, RemoteLibSlot, RemoteLibStatic }, { version: '1.0.0' });
  });
}

export { mount, unmount, HelloWorld, RemoteLibSlot, RemoteLibStatic };
