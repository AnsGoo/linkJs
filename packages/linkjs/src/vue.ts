import {
  Fragment,
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
import { getRemote, loadApp, loadRemote, subscribeRemoteUpdate, type LoadAppOptions } from './index';
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

export interface CreateRemoteAppOptions extends LoadAppOptions {
  /** 加载中展示的组件。 */
  loading?: Component;
  /** 加载失败展示的组件，会收到 `{ error }`。 */
  error?: Component;
  /** 加载失败回调。 */
  onError?: (error: unknown) => void;
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
 * 传入 `options.loading` / `options.error` 可分别渲染加载中与失败占位。
 */
function createRemoteApp(entry: string, options?: CreateRemoteAppOptions) {
  const appName = entry.split('/')[0];
  return defineComponent({
    name: 'LinkjsRemoteApp',
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const el = ref<HTMLElement>();
      const status = ref<'loading' | 'loaded' | 'error'>('loading');
      const err = shallowRef<unknown>(null);
      let mod: MountableModule | null = null;
      let iso: ShadowIsolation | null = null;
      let mounted = false;

      const doMount = async () => {
        if (!el.value) {
          return;
        }
        status.value = 'loading';
        if (options?.shadow) {
          iso = createShadowIsolation(el.value, appName);
        }
        try {
          mod = ((await loadApp(appName, options)) as unknown as MountableModule) || null;
          const target = iso ? iso.mountPoint : el.value;
          mod?.mount?.(target, { ...attrs });
          mounted = true;
          status.value = 'loaded';
        } catch (error) {
          err.value = error;
          status.value = 'error';
          console.error(`[linkjs] Failed to mount remote "${entry}":`, error);
          options?.onError?.(error);
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

      return () => {
        const children = [h('div', { ref: el })];
        if (status.value === 'loading' && options?.loading) {
          children.unshift(h(options.loading));
        }
        if (status.value === 'error' && options?.error) {
          children.unshift(h(options.error, { error: err.value }));
        }
        return h(Fragment, null, children);
      };
    },
  });
}

/**
 * 在共享影子树内为「宿主自渲染」的内容分配一个独立挂载节点并返回其 ref。
 *
 * 之所以不复用 `iso.mountPoint`：`createRemoteApp`（路线 B）会用 `mod.mount()` 清空它
 * 自己的 `iso.mountPoint`，若路线 A 也渲染到同一节点，内容会被清掉。同一 name 的多个
 * 消费者各自拥有独立节点，共享同一影子树（样式已由加载期捕获）。
 */
function useShadowSlot(name: string) {
  const host = ref<HTMLElement>();
  const mountPoint = shallowRef<HTMLElement>();
  let iso: ShadowIsolation | null = null;
  let slotEl: HTMLElement | null = null;

  onMounted(() => {
    // 兜底重试：极少数时序下（如过渡/异步路由）`host` 在 onMounted 时可能尚未就绪，
    // 若直接 return 会导致影子树永不建立 → 组件“消失”。这里有限次重试直到 host 出现。
    let tries = 0;
    const setup = () => {
      if (!host.value) {
        if (tries++ < 10) {
          requestAnimationFrame(setup);
        }
        return;
      }
      // 不开启捕获窗口：样式由 loadApp/loadLib({ shadow: true }) 在加载期捕获，
      // 这里只接管挂载点。若开启并立即关闭，会打断其它远程加载的捕获窗口导致样式泄漏。
      iso = createShadowIsolation(host.value, name, { capture: false });
      slotEl = document.createElement('div');
      iso.shadow.appendChild(slotEl);
      mountPoint.value = slotEl;
    };
    setup();
  });
  onUnmounted(() => {
    slotEl?.remove();
    slotEl = null;
    iso?.dispose();
    iso = null;
  });

  return { host, mountPoint };
}

/**
 * 把插槽内容渲染进 ShadowRoot 的容器组件，用于隔离**由宿主自身渲染**的远程内容
 * （例如 `loadLib` 返回的组件）。
 *
 * 与 `createRemoteApp` 的路线 B（子应用自挂载）不同：这里的内容仍属于宿主的 Vue 实例，
 * 只是通过 `Teleport` 把 DOM 放进影子树；样式则依赖 `loadLib({ shadow: true })` 在加载期
 * 把该远程的样式捕获进同一影子树。
 *
 * 注：消费单个远程组件时优先用 `createRemoteComponent`，无需手动包一层。
 */
const LinkjsShadowRoot = defineComponent({
  name: 'LinkjsShadowRoot',
  props: {
    /** 与 `loadLib` 的 appName 一致，用于复用同一影子目标。 */
    name: { type: String, required: true },
  },
  setup(props, { slots }) {
    const { host, mountPoint } = useShadowSlot(props.name);

    return () =>
      h('div', { ref: host }, mountPoint.value ? [h(Teleport as any, { to: mountPoint.value }, slots.default?.())] : []);
  },
});

export interface CreateRemoteComponentOptions extends LoadAppOptions {}

/**
 * 创建一个可直接使用的远程组件（路线 A 的推荐入口）。
 *
 * 内部负责：按 `entry` 加载远程（`loadRemote`，自动区分 app/lib 与 `<remote>/<Expose>`）、
 * 订阅 `REMOTE_UPDATE` 响应式重解析、把宿主 attrs 透传给远程组件。
 * **默认开启样式隔离**（`shadow: true`）：把组件渲染进该远程的影子树，无需手动包 `LinkjsShadowRoot`；
 * 传 `{ shadow: false }` 可关闭。
 *
 * ```ts
 * const RemoteHelloWorld = createRemoteComponent('remoteApp/HelloWorld'); // 默认隔离
 * ```
 * ```html
 * <RemoteHelloWorld msg="hi" :age="18" />
 * ```
 */
function createRemoteComponent<K extends keyof LinkjsRemoteTypes & string>(
  entry: K,
  options?: CreateRemoteComponentOptions,
): LinkjsRemoteTypes[K];
function createRemoteComponent(entry: string, options?: CreateRemoteComponentOptions): Component;
function createRemoteComponent(entry: string, options?: CreateRemoteComponentOptions): Component {
  const appName = entry.split('/')[0];
  return defineComponent({
    name: 'LinkjsRemoteComponent',
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      const comp = shallowRef<Component | null>(null);
      // 默认开启样式隔离；显式 `{ shadow: false }` 才关闭。
      const shadow = options?.shadow === false ? null : useShadowSlot(appName);
      // 影子挂载点迟迟未就绪时的兜底：回退为普通渲染，避免组件“消失”。
      const shadowFallback = ref(false);
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

      const resolve = () => {
        comp.value = (getRemote(entry) as Component | null) ?? null;
      };

      onMounted(() => {
        // 与渲染一致：默认以 shadow 加载，确保样式被捕获进影子树。
        loadRemote(entry, { ...options, shadow: options?.shadow !== false })
          .then(resolve)
          .catch((error) => {
            console.error(`[linkjs] Failed to load remote component "${entry}":`, error);
          });
        if (shadow) {
          fallbackTimer = setTimeout(() => {
            if (!shadow.mountPoint.value) {
              shadowFallback.value = true;
            }
          }, 800);
        }
      });

      const off = subscribeRemoteUpdate(entry, resolve);
      onUnmounted(() => {
        off();
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
        }
      });

      return () => {
        const inner = comp.value
          ? h(comp.value, { ...attrs }, slots.default ? { default: () => slots.default!() } : undefined)
          : null;
        if (!shadow || shadowFallback.value) {
          return inner;
        }
        return h(
          'div',
          { ref: shadow.host },
          shadow.mountPoint.value ? [h(Teleport as any, { to: shadow.mountPoint.value }, [inner])] : [],
        );
      };
    },
  });
}

export { useRemoteModule, createRemoteApp, createRemoteComponent, LinkjsShadowRoot };
