import type { RuntimePlugin } from './index';

/**
 * Retry / Fallback 运行时插件。
 *
 * 通过 `apply(instance)` 包装实例上的 `loadApp` / `loadLib` / `loadRemote`：
 * 首次加载失败时，按候补 host 依次重试（可用于 CDN 多源、灰度、降级域名）。
 *
 * ```ts
 * createInstance({
 *   plugin: retryPlugin({
 *     fallbackHosts: { remote: ['https://cdn-b.example.com', 'https://cdn-c.example.com'] },
 *     fallback: ['https://backup.example.com'],
 *     retries: 2,
 *   }),
 * });
 * ```
 */
export interface RetryPluginOptions {
  /** 按远程名配置的候补 host 列表（按序尝试）。 */
  fallbackHosts?: Record<string, string[]>;
  /** 全局候选 host 列表（所有远程通用）。 */
  fallback?: string[];
  /** 最大重试次数（不含首次）。缺省时尝试所有候选。 */
  retries?: number;
  /** 每次重试前回调。 */
  onRetry?: (info: { entry: string; host?: string; nextHost?: string; attempt: number; error: unknown }) => void;
  /** 全部候选失败后回调。 */
  onError?: (error: unknown, entry: string) => void;
}

type LoadFn = (entry: string, options?: Record<string, unknown>) => Promise<unknown>;

/** 组装候选 host：显式 host -> 按名候补 -> 全局候补（去重，保留首个为缺省解析）。 */
function collectHosts(appName: string, primary: string | undefined, options: RetryPluginOptions): (string | undefined)[] {
  const hosts: (string | undefined)[] = [primary];
  hosts.push(...(options.fallbackHosts?.[appName] ?? []));
  if (options.fallback) {
    hosts.push(...options.fallback);
  }
  const seen = new Set<string | undefined>();
  const unique: (string | undefined)[] = [];
  for (const host of hosts) {
    if (!seen.has(host)) {
      seen.add(host);
      unique.push(host);
    }
  }
  return unique;
}

export function retryPlugin(options: RetryPluginOptions = {}): RuntimePlugin {
  const wrap = (original: unknown): unknown => {
    if (typeof original !== 'function') {
      return original;
    }
    const fn = original as LoadFn;
    return async (entry: string, opts: Record<string, unknown> = {}) => {
      const appName = entry.split('/')[0];
      const candidates = collectHosts(appName, opts.host as string | undefined, options);
      const maxAttempts = options.retries != null ? Math.min(candidates.length, options.retries + 1) : candidates.length;

      let lastError: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await fn(entry, { ...opts, host: candidates[attempt] });
        } catch (error) {
          lastError = error;
          options.onRetry?.({
            entry,
            host: candidates[attempt],
            nextHost: candidates[attempt + 1],
            attempt: attempt + 1,
            error,
          });
        }
      }
      options.onError?.(lastError, entry);
      throw lastError;
    };
  };

  return {
    name: 'linkjs-retry',
    apply(instance) {
      const host = instance as { loadApp?: unknown; loadLib?: unknown; loadRemote?: unknown };
      host.loadApp = wrap(host.loadApp);
      host.loadLib = wrap(host.loadLib);
      host.loadRemote = wrap(host.loadRemote);
    },
  };
}
