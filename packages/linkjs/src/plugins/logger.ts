import type { RuntimePlugin } from './index';

/** 一次远程加载的可观测指标。 */
export interface LoadMetric {
  entry: string;
  kind: 'app' | 'lib' | 'remote';
  host?: string;
  durationMs: number;
  status: 'loaded' | 'error';
  error?: unknown;
  time: number;
}

export type LogEvent =
  | { type: 'load'; entry: string; kind: string; host?: string; durationMs: number; status: 'loaded' | 'error'; error?: unknown }
  | { type: 'share'; name: string; durationMs?: number }
  | { type: 'preload'; assets: number };

export interface LoggerPluginOptions {
  /** 自定义日志输出；缺省 `console.log`。 */
  log?: (event: LogEvent) => void;
  /** 日志前缀，缺省 `[linkjs]`。 */
  prefix?: string;
  /** 是否收集指标（`getLoadMetrics()` 读取）。默认 true。 */
  collect?: boolean;
}

const MAX_METRICS = 200;

// 用 global 兜底存储：避免模块重复实例化导致读取端拿不到写入端的数据。
function metricsStore(): LoadMetric[] {
  const g = globalThis as { __linkjs_load_metrics__?: LoadMetric[] };
  return (g.__linkjs_load_metrics__ ??= []);
}

/** 读取已收集的加载指标。 */
function getLoadMetrics(): LoadMetric[] {
  return [...metricsStore()];
}

/** 清空加载指标。 */
function clearLoadMetrics(): void {
  metricsStore().length = 0;
}

function format(event: LogEvent, prefix: string): string {
  if (event.type === 'load') {
    const mark = event.status === 'error' ? '✗' : '✓';
    const host = event.host ? ` @${event.host}` : '';
    const err = event.error ? ` — ${(event.error as { message?: string })?.message ?? String(event.error)}` : '';
    return `${prefix} ${mark} load "${event.entry}"${host} (${event.kind}) ${event.durationMs}ms${err}`;
  }
  if (event.type === 'share') {
    const ms = event.durationMs != null ? ` ${Math.round(event.durationMs)}ms` : '';
    return `${prefix} ⇄ share "${event.name}"${ms}`;
  }
  return `${prefix} ⇩ preload ${event.assets} asset(s)`;
}

/**
 * Logger 运行时插件：记录远程加载耗时/结果与共享/预加载事件，并收集指标。
 *
 * ```ts
 * createInstance({ plugin: loggerPlugin({ log: (e) => myReporter(e) }) });
 * getLoadMetrics(); // [{ entry, kind, host, durationMs, status, time }]
 * ```
 */
export function loggerPlugin(options: LoggerPluginOptions = {}): RuntimePlugin {
  const { prefix = '[linkjs]', collect = true } = options;
  const emit = (event: LogEvent) => {
    if (options.log) {
      options.log(event);
    } else {
      // eslint-disable-next-line no-console
      console.log(format(event, prefix));
    }
  };

  const wrap = (original: unknown, kind: LoadMetric['kind']): unknown => {
    if (typeof original !== 'function') {
      return original;
    }
    const fn = original as (entry: string, opts?: Record<string, unknown>) => Promise<unknown>;
    return async (entry: string, opts: Record<string, unknown> = {}) => {
      const start = Date.now();
      try {
        const result = await fn(entry, opts);
        const metric: LoadMetric = {
          entry,
          kind,
          host: opts.host as string | undefined,
          durationMs: Date.now() - start,
          status: 'loaded',
          time: Date.now(),
        };
        if (collect) {
          const store = metricsStore();
          store.push(metric);
          if (store.length > MAX_METRICS) {
            store.splice(0, store.length - MAX_METRICS);
          }
        }
        emit({ type: 'load', ...metric });
        return result;
      } catch (error) {
        const metric: LoadMetric = {
          entry,
          kind,
          host: opts.host as string | undefined,
          durationMs: Date.now() - start,
          status: 'error',
          error,
          time: Date.now(),
        };
        if (collect) {
          const store = metricsStore();
          store.push(metric);
          if (store.length > MAX_METRICS) {
            store.splice(0, store.length - MAX_METRICS);
          }
        }
        emit({ type: 'load', entry, kind, host: metric.host, durationMs: metric.durationMs, status: 'error', error });
        throw error;
      }
    };
  };

  return {
    name: 'linkjs-logger',
    apply(instance) {
      const host = instance as { loadApp?: unknown; loadLib?: unknown; loadRemote?: unknown };
      host.loadApp = wrap(host.loadApp, 'app');
      host.loadLib = wrap(host.loadLib, 'lib');
      host.loadRemote = wrap(host.loadRemote, 'remote');
    },
    afterLoadShare(name, _module, durationMs) {
      emit({ type: 'share', name, durationMs });
    },
    afterPreloadRemote(_manifest, assets) {
      emit({ type: 'preload', assets: assets.length });
    },
  };
}

export { getLoadMetrics, clearLoadMetrics };
