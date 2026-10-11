import type { RuntimePlugin } from './index';

/** 加载超时错误。 */
export class TimeoutError extends Error {
  entry: string;
  timeout: number;
  constructor(entry: string, timeout: number) {
    super(`[linkjs] load "${entry}" timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
    this.entry = entry;
    this.timeout = timeout;
  }
}

/**
 * Timeout / Abort 运行时插件。
 *
 * 包装加载方法，为每次远程加载设定超时；超时后：
 * - 通过 `AbortController` **中止入口 HTML 的 fetch**（真正取消网络请求）；
 * - 其余（如图书馆的 `import()`）无法取消，但对调用方以 `TimeoutError` reject。
 *
 * ```ts
 * createInstance({ plugin: timeoutPlugin({ timeout: 8000, timeouts: { 'remote-lib': 3000 } }) });
 * ```
 */
export interface TimeoutPluginOptions {
  /** 默认超时（毫秒），默认 10000。设 0/负值表示不限制。 */
  timeout?: number;
  /** 按远程名覆盖超时。 */
  timeouts?: Record<string, number>;
  /** 超时回调。 */
  onTimeout?: (info: { entry: string; timeout: number; kind: string }) => void;
}

type LoadFn = (entry: string, opts?: Record<string, unknown>) => Promise<unknown>;

export function timeoutPlugin(options: TimeoutPluginOptions = {}): RuntimePlugin {
  const defaultTimeout = options.timeout ?? 10000;

  const wrap = (original: unknown, kind: string): unknown => {
    if (typeof original !== 'function') {
      return original;
    }
    const fn = original as LoadFn;
    return (entry: string, opts: Record<string, unknown> = {}) => {
      const appName = entry.split('/')[0];
      const timeout = options.timeouts?.[appName] ?? defaultTimeout;
      if (!timeout || timeout <= 0) {
        return fn(entry, opts);
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          options.onTimeout?.({ entry, timeout, kind });
          reject(new TimeoutError(entry, timeout));
        }, timeout);
      });

      const call = fn(entry, controller ? { ...opts, signal: controller.signal } : opts);
      return Promise.race([call, timeoutPromise]).finally(() => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  };

  return {
    name: 'linkjs-timeout',
    apply(instance) {
      const host = instance as { loadApp?: unknown; loadLib?: unknown; loadRemote?: unknown };
      host.loadApp = wrap(host.loadApp, 'app');
      host.loadLib = wrap(host.loadLib, 'lib');
      host.loadRemote = wrap(host.loadRemote, 'remote');
    },
  };
}
