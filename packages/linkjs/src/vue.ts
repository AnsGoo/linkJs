import {
  defineComponent,
  getCurrentScope,
  h,
  onMounted,
  onScopeDispose,
  onUnmounted,
  ref,
  shallowRef,
  type Component,
  type ShallowRef,
} from 'vue';
import { getRemote, loadApp, subscribeRemoteUpdate, type LoadAppOptions } from './index';

/**
 * 宿主消费远程组件并响应式重解析 expose。
 *
 * 返回的 ref 在远程应用 re-expose（入口变化）或组件对象被 HMR 替换时自动更新，
 * 宿主用 `<component :is="comp" />` 即可无刷新切换。
 */
function useRemoteModule<C = Component>(entry: string, options?: LoadAppOptions): ShallowRef<C | null> {
  const appName = entry.split('/')[0];
  const ref = shallowRef<C | null>(null) as ShallowRef<C | null>;

  const resolve = () => {
    ref.value = (getRemote(entry) as C) ?? null;
  };

  loadApp(appName, options).then(resolve).catch((error) => {
    console.error(`[linkjs] Failed to load remote "${entry}":`, error);
  });

  const off = subscribeRemoteUpdate(entry, resolve);
  if (getCurrentScope()) {
    onScopeDispose(off);
  }

  return ref;
}

interface MountableModule {
  mount?: (el: HTMLElement, props?: Record<string, any>) => void;
  update?: (props?: Record<string, any>) => void;
  unmount?: () => void;
}

/**
 * 宿主容器组件（路线 B）：提供一个 DOM 节点，让子应用用**自己的 runtime**
 * 挂载/卸载。子应用入口需 expose `{ mount, unmount }`。
 *
 * 子应用入口/expose 变化时（`REMOTE_UPDATE`）自动卸载旧实例并重新挂载，
 * 宿主其余状态不受影响。
 */
function createRemoteApp(entry: string, options?: LoadAppOptions) {
  const appName = entry.split('/')[0];
  return defineComponent({
    name: 'LinkjsRemoteApp',
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const el = ref<HTMLElement>();
      let mod: MountableModule | null = null;
      let mounted = false;

      const doMount = async () => {
        if (!el.value) {
          return;
        }
        mod = ((await loadApp(appName, options)) as unknown as MountableModule) || null;
        mod?.mount?.(el.value, { ...attrs });
        mounted = true;
      };
      const doUnmount = () => {
        if (mounted) {
          mod?.unmount?.();
        }
        mounted = false;
      };

      onMounted(() => {
        void doMount();
      });
      const off = subscribeRemoteUpdate(entry, async () => {
        doUnmount();
        await doMount();
      });
      onUnmounted(() => {
        off();
        doUnmount();
      });

      return () => h('div', { ref: el });
    },
  });
}

export { useRemoteModule, createRemoteApp };
