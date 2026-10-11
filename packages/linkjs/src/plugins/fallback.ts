import type { RuntimePlugin } from './index';

/**
 * Fallback（降级）运行时插件。
 *
 * 通过 `apply(instance)` 包装加载方法：远程加载失败时**不 reject，而是 resolve 兜底值**，
 * 让容器（如 `createRemoteApp`）优雅降级而非报错中断。
 *
 * 与 `retryPlugin` 组合（注册顺序 `[retryPlugin(...), fallbackPlugin(...)]`）：
 * 先多源重试，全部失败后再降级。
 *
 * ```ts
 * createInstance({
 *   plugin: [
 *     retryPlugin({ fallbackHosts: { remote: ['https://cdn-b'] } }),
 *     fallbackPlugin({ fallback: { remote: () => import('./offline-remote') } }),
 *   ],
 * });
 * ```
 */
export interface FallbackPluginOptions {
  /** 按远程名/entry 配置的兜底值或其工厂。工厂接收 `(error, entry)`。 */
  fallback?: Record<string, unknown | ((error: unknown, entry: string) => unknown | Promise<unknown>)>;
  /** 无显式兜底时是否用默认占位模块（`mount` 渲染失败提示）。默认 true。 */
  defaultFallback?: boolean;
  /** 加载失败回调（无论是否降级都会调用）。 */
  onError?: (error: unknown, entry: string) => void;
}

/** 默认占位：一个可 `mount/unmount` 的模块，渲染失败提示。 */
function createPlaceholder(entry: string, error: unknown) {
  return {
    __linkjsFallback: true,
    mount(el: HTMLElement) {
      if (!el || typeof document === 'undefined') {
        return;
      }
      const box = document.createElement('div');
      box.setAttribute(
        'style',
        'padding:12px 16px;border:1px dashed #e5484d;border-radius:8px;color:#c0392b;font:13px/1.5 system-ui,sans-serif',
      );
      box.textContent = `远程「${entry}」加载失败：${(error as { message?: string })?.message ?? String(error)}`;
      el.appendChild(box);
    },
    unmount() {
      /* 无副作用 */
    },
  };
}

export function fallbackPlugin(options: FallbackPluginOptions = {}): RuntimePlugin {
  const { fallback = {}, defaultFallback = true, onError } = options;

  const resolveFallback = async (entry: string, error: unknown): Promise<unknown> => {
    const appName = entry.split('/')[0];
    const candidate = fallback[appName] ?? fallback[entry];
    if (candidate !== undefined) {
      return typeof candidate === 'function' ? await (candidate as (error: unknown, entry: string) => unknown)(error, entry) : candidate;
    }
    if (defaultFallback) {
      return createPlaceholder(entry, error);
    }
    throw error;
  };

  const wrap = (original: unknown): unknown => {
    if (typeof original !== 'function') {
      return original;
    }
    const fn = original as (entry: string, opts?: Record<string, unknown>) => Promise<unknown>;
    return async (entry: string, opts?: Record<string, unknown>) => {
      try {
        return await fn(entry, opts);
      } catch (error) {
        onError?.(error, entry);
        return resolveFallback(entry, error);
      }
    };
  };

  return {
    name: 'linkjs-fallback',
    apply(instance) {
      const host = instance as { loadApp?: unknown; loadLib?: unknown; loadRemote?: unknown };
      host.loadApp = wrap(host.loadApp);
      host.loadLib = wrap(host.loadLib);
      host.loadRemote = wrap(host.loadRemote);
    },
  };
}
