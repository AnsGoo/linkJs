import {
  Teleport,
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
import { createShadowIsolation, type ShadowIsolation } from './sandbox/shadow';

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
 *
 * 传入 `options.shadow = true` 时，在宿主节点上创建 ShadowRoot，子应用连同其样式
 * 都挂进影子树，实现浏览器原生的 CSS 隔离（dev/build、跨构建器行为一致）。
 */
function createRemoteApp(entry: string, options?: LoadAppOptions) {
  const appName = entry.split('/')[0];
  return defineComponent({
    name: 'LinkjsRemoteApp',
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const el = ref<HTMLElement>();
      let mod: MountableModule | null = null;
      let iso: ShadowIsolation | null = null;
      let mounted = false;

      const doMount = async () => {
        if (!el.value) {
          return;
        }
        if (options?.shadow) {
          iso = createShadowIsolation(el.value, appName);
        }
        try {
          mod = ((await loadApp(appName, options)) as unknown as MountableModule) || null;
          const target = iso ? iso.mountPoint : el.value;
          mod?.mount?.(target, { ...attrs });
          mounted = true;
        } finally {
          iso?.stopCapture();
        }
      };
      const doUnmount = () => {
        if (mounted) {
          mod?.unmount?.();
          mounted = false;
        }
        iso?.dispose();
        iso = null;
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

/**
 * 把插槽内容渲染进 ShadowRoot 的容器组件，用于隔离**由宿主自身渲染**的远程内容
 * （例如 `loadLib` 返回的组件）。
 *
 * 与 `createRemoteApp` 的路线 B（子应用自挂载）不同：这里的内容仍属于宿主的 Vue 实例，
 * 只是通过 `Teleport` 把 DOM 放进影子树；样式则依赖 `loadLib({ shadow: true })` 在加载期
 * 把该远程的样式捕获进同一影子树。
 */
const LinkjsShadowRoot = defineComponent({
  name: 'LinkjsShadowRoot',
  props: {
    /** 与 `loadLib` 的 appName 一致，用于复用同一影子目标。 */
    name: { type: String, required: true },
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement>();
    const mountPoint = shallowRef<HTMLElement>();
    let iso: ShadowIsolation | null = null;

    onMounted(() => {
      if (!host.value) {
        return;
      }
      iso = createShadowIsolation(host.value, props.name);
      mountPoint.value = iso.mountPoint;
      // 库样式已在 loadLib({ shadow: true }) 的加载窗口内捕获，这里只需接管挂载点。
      iso.stopCapture();
    });
    onUnmounted(() => {
      iso?.dispose();
      iso = null;
    });

    return () =>
      h('div', { ref: host }, mountPoint.value ? [h(Teleport as any, { to: mountPoint.value }, slots.default?.())] : []);
  },
});

export { useRemoteModule, createRemoteApp, LinkjsShadowRoot };
