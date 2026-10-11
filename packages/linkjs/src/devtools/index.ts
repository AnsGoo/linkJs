/**
 * 可观测性：结构化快照 + 诊断通道。
 *
 * - `buildSnapshot(instance)` 汇总 remotes / shares / plugins / diagnostics 的当前状态；
 * - `recordDiagnostic` 收集版本冲突、加载失败等问题，并可选订阅；
 * - `installDevtools(instance)` 把 `getSnapshot` 挂到全局 `__LINKJS__` 与 `$linkjs.debug`，
 *   便于 DevTools 扩展或控制台排查。
 */

import { availablePlugins } from '../plugins/catalog';
import { getLoadMetrics, type LoadMetric } from '../plugins/logger';
import { getPerfEntries, type PerfEntry } from '../perf';
import { VersionComparator } from '../share/version-comparator';

export interface Diagnostic {
  level: 'warn' | 'error';
  /** 稳定错误码，例如 `SHARE_VERSION_MISMATCH` / `LOAD_REMOTE_ERROR`。 */
  code: string;
  message: string;
  time: number;
  context?: Record<string, unknown>;
}

export interface RemoteSnapshot {
  name: string;
  /** 展示名（远程 manifest 的 `name`）。 */
  displayName?: string;
  type?: string;
  status?: string;
  host?: string;
  entry: unknown;
  version?: string;
  shareScope?: string[];
}

export interface ShareVersionSnapshot {
  version: string;
  singleton?: boolean;
  loaded: boolean;
  requiredVersion?: string | false;
  strictVersion?: boolean;
  eager?: boolean;
}

export interface ShareSnapshot {
  scope: string;
  name: string;
  versions: ShareVersionSnapshot[];
}

/** 共享版本冲突：某 `requiredVersion` 不被任何已提供版本满足。 */
export interface ShareConflict {
  scope: string;
  name: string;
  requiredVersion: string;
  provided: string[];
}

export interface LinkjsSnapshot {
  instance: {
    id: string;
    name: string;
    version: string;
    mode: string;
    shareStrategy: string;
  };
  remotes: RemoteSnapshot[];
  shares: ShareSnapshot[];
  /** 共享版本冲突（谁需要 X / 谁提供 Y）。 */
  conflicts: ShareConflict[];
  /** 已注册插件的名字。 */
  plugins: string[];
  /** 全部可用插件（内置 + 已注册的自定义插件）及启用状态。 */
  availablePlugins: PluginSnapshot[];
  /** 加载指标（logger 插件收集）。 */
  metrics: LoadMetric[];
  /** 各阶段性能标记。 */
  perf: PerfEntry[];
  diagnostics: Diagnostic[];
}

export interface PluginSnapshot {
  name: string;
  description: string;
  enabled: boolean;
}

const MAX_DIAGNOSTICS = 200;

interface DiagnosticStore {
  items: Diagnostic[];
  listeners: Set<(diagnostic: Diagnostic) => void>;
}

// 用 global 兜底存储：避免模块重复实例化导致读/写分属不同副本。
function store(): DiagnosticStore {
  const g = globalThis as { __linkjs_diag__?: DiagnosticStore };
  return (g.__linkjs_diag__ ??= { items: [], listeners: new Set() });
}

/** 记录一条诊断（同时按级别输出到控制台，并通知订阅者）。 */
function recordDiagnostic(input: Omit<Diagnostic, 'time'> & { time?: number }): Diagnostic {
  const bucket = store();
  const diagnostic: Diagnostic = { ...input, time: input.time ?? Date.now() };
  bucket.items.push(diagnostic);
  if (bucket.items.length > MAX_DIAGNOSTICS) {
    bucket.items.splice(0, bucket.items.length - MAX_DIAGNOSTICS);
  }
  const line = `[linkjs] ${diagnostic.message}`;
  if (diagnostic.level === 'error') {
    console.error(line);
  } else {
    console.warn(line);
  }
  bucket.listeners.forEach((listener) => {
    try {
      listener(diagnostic);
    } catch {
      /* 订阅者异常不影响主流程 */
    }
  });
  return diagnostic;
}

function getDiagnostics(): Diagnostic[] {
  return [...store().items];
}

function clearDiagnostics(): void {
  store().items.length = 0;
}

/** 订阅诊断（返回取消订阅函数）。 */
function onDiagnostic(listener: (diagnostic: Diagnostic) => void): () => void {
  const listeners = store().listeners;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 汇总当前 linkjs 实例的可观测状态。 */
function buildSnapshot(instance: any): LinkjsSnapshot {
  const remotes: RemoteSnapshot[] = [];
  instance.remotes?.forEach((remote: any) => {
    remotes.push({
      name: remote.name,
      displayName: remote.displayName,
      type: remote.type,
      status: remote.status,
      host: remote.host,
      entry: remote.entry,
      version: remote.version,
      shareScope: remote.shareScope,
    });
  });

  const shares: ShareSnapshot[] = [];
  instance.shares?.forEach((scopeMap: Map<string, any[]>, scope: string) => {
    const loadedScope: Map<string, any> | undefined = instance.sharedMap?.get(scope);
    scopeMap.forEach((options: any[], name: string) => {
      shares.push({
        scope,
        name,
        versions: options.map((option) => {
          const declared: string | undefined = option.version;
          const versionKey = `${name}@${declared || '0.0.0'}`;
          const loadedModule = loadedScope?.get(versionKey);
          // 未声明 version 时，尽量从已加载模块暴露的 `version` 读取（如 vue）；
          // 读不到则标记为 unknown，避免误显示 0.0.0。
          const exposed =
            loadedModule?.version ?? (loadedModule as { default?: { version?: unknown } })?.default?.version;
          const actualVersion = declared || (typeof exposed === 'string' ? exposed : 'unknown');
          return {
            version: actualVersion,
            singleton: option.singleton,
            loaded: Boolean(loadedModule),
            requiredVersion: option.requiredVersion,
            strictVersion: option.strictVersion,
            eager: option.eager,
          };
        }),
      });
    });
  });

  const registered: string[] = (instance.plugins ?? []).map((plugin: { name: string }) => plugin.name);
  const available: PluginSnapshot[] = [
    ...availablePlugins.map((plugin) => ({ ...plugin, enabled: registered.includes(plugin.name) })),
    ...registered
      .filter((name) => !availablePlugins.some((plugin) => plugin.name === name))
      .map((name) => ({ name, description: '(自定义)', enabled: true })),
  ];

  // 共享版本冲突：谁需要（requiredVersion）不被任何已提供版本满足。
  const conflicts: ShareConflict[] = [];
  for (const share of shares) {
    const provided = share.versions.map((version) => version.version).filter((v) => v && v !== 'unknown');
    const requirements = new Set(
      share.versions
        .map((version) => (typeof version.requiredVersion === 'string' ? version.requiredVersion : undefined))
        .filter((value): value is string => Boolean(value)),
    );
    for (const requiredVersion of requirements) {
      let satisfied = false;
      try {
        satisfied = provided.some((version) => VersionComparator.satisfiesVersion(version, requiredVersion));
      } catch {
        satisfied = false;
      }
      if (!satisfied) {
        conflicts.push({ scope: share.scope, name: share.name, requiredVersion, provided });
      }
    }
  }

  return {
    instance: {
      id: instance.id,
      name: instance.name,
      version: instance.version,
      mode: instance.mode,
      shareStrategy: instance.shareStrategy,
    },
    remotes,
    shares,
    conflicts,
    plugins: registered,
    availablePlugins: available,
    metrics: getLoadMetrics(),
    perf: getPerfEntries(),
    diagnostics: getDiagnostics(),
  };
}

/** DevTools 可调用的运行时操作（由 index.ts 注入，避免循环依赖）。 */
export interface DevtoolsOps {
  clearCache?: (name?: string) => void;
  unload?: (name?: string) => void;
  load?: (entry: string, options?: unknown) => Promise<unknown>;
  preload?: (options: unknown) => Promise<unknown>;
}

/** 暴露 DevTools 接口：全局 `__LINKJS__` 与 `$linkjs.debug`。 */
function installDevtools(instance: any, ops: DevtoolsOps = {}): void {
  const api = {
    // 只读
    getSnapshot: () => buildSnapshot(instance),
    remotes: () => buildSnapshot(instance).remotes,
    shares: () => buildSnapshot(instance).shares,
    conflicts: () => buildSnapshot(instance).conflicts,
    metrics: () => buildSnapshot(instance).metrics,
    perf: () => buildSnapshot(instance).perf,
    getDiagnostics,
    clearDiagnostics,
    onDiagnostic,
    // 操作入口
    clearCache: ops.clearCache,
    unload: ops.unload,
    load: ops.load,
    preload: ops.preload,
  };
  const g = globalThis as any;
  g.__LINKJS__ = api;
  if (g.$linkjs) {
    const debug = g.$linkjs.debug ?? {};
    g.$linkjs.debug = { ...debug, ...api };
  }
}

export interface DevtoolsOptions {
  /** 是否启用页内面板；缺省时开发模式自动启用。 */
  enabled?: boolean;
  /** 侧边栏停靠位置，默认右侧。 */
  position?: 'right' | 'left';
}

/**
 * 按需挂载**页内 DevTools 面板**（开发模式默认启用）。
 * 动态 `import()` 面板实现，生产构建不会加载这部分代码。
 */
function maybeInstallDevtoolsUI(instance: any, option?: boolean | DevtoolsOptions): void {
  if (typeof document === 'undefined') {
    return;
  }
  const enabled = typeof option === 'boolean' ? option : option?.enabled;
  const shouldEnable = enabled ?? instance?.mode === 'development';
  if (!shouldEnable) {
    return;
  }
  const uiOptions = typeof option === 'object' ? option : undefined;
  void import('./ui')
    .then((mod) => mod.mountDevtoolsUI(instance, uiOptions))
    .catch(() => {
      /* 面板加载失败不影响主流程 */
    });
}

/** 卸载页内 DevTools 面板。 */
function uninstallDevtoolsUI(): void {
  if (typeof document === 'undefined') {
    return;
  }
  void import('./ui')
    .then((mod) => mod.unmountDevtoolsUI())
    .catch(() => {
      /* ignore */
    });
}

export {
  recordDiagnostic,
  getDiagnostics,
  clearDiagnostics,
  onDiagnostic,
  buildSnapshot,
  installDevtools,
  maybeInstallDevtoolsUI,
  uninstallDevtoolsUI,
};
