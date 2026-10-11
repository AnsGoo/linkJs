/**
 * 可观测性：结构化快照 + 诊断通道。
 *
 * - `buildSnapshot(instance)` 汇总 remotes / shares / plugins / diagnostics 的当前状态；
 * - `recordDiagnostic` 收集版本冲突、加载失败等问题，并可选订阅；
 * - `installDevtools(instance)` 把 `getSnapshot` 挂到全局 `__LINKJS__` 与 `$linkjs.debug`，
 *   便于 DevTools 扩展或控制台排查。
 */

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

export interface LinkjsSnapshot {
  instance: {
    name: string;
    version: string;
    mode: string;
    shareStrategy: string;
  };
  remotes: RemoteSnapshot[];
  shares: ShareSnapshot[];
  plugins: string[];
  diagnostics: Diagnostic[];
}

const MAX_DIAGNOSTICS = 200;

const diagnostics: Diagnostic[] = [];
const listeners = new Set<(diagnostic: Diagnostic) => void>();

/** 记录一条诊断（同时按级别输出到控制台，并通知订阅者）。 */
function recordDiagnostic(input: Omit<Diagnostic, 'time'> & { time?: number }): Diagnostic {
  const diagnostic: Diagnostic = { ...input, time: input.time ?? Date.now() };
  diagnostics.push(diagnostic);
  if (diagnostics.length > MAX_DIAGNOSTICS) {
    diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
  }
  const line = `[linkjs] ${diagnostic.message}`;
  if (diagnostic.level === 'error') {
    console.error(line);
  } else {
    console.warn(line);
  }
  listeners.forEach((listener) => {
    try {
      listener(diagnostic);
    } catch {
      /* 订阅者异常不影响主流程 */
    }
  });
  return diagnostic;
}

function getDiagnostics(): Diagnostic[] {
  return [...diagnostics];
}

function clearDiagnostics(): void {
  diagnostics.length = 0;
}

/** 订阅诊断（返回取消订阅函数）。 */
function onDiagnostic(listener: (diagnostic: Diagnostic) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 汇总当前 linkjs 实例的可观测状态。 */
function buildSnapshot(instance: any): LinkjsSnapshot {
  const remotes: RemoteSnapshot[] = [];
  instance.remotes?.forEach((remote: any) => {
    remotes.push({
      name: remote.name,
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

  return {
    instance: {
      name: instance.name,
      version: instance.version,
      mode: instance.mode,
      shareStrategy: instance.shareStrategy,
    },
    remotes,
    shares,
    plugins: (instance.plugins ?? []).map((plugin: { name: string }) => plugin.name),
    diagnostics: getDiagnostics(),
  };
}

/** 暴露 DevTools 接口：全局 `__LINKJS__` 与 `$linkjs.debug`。 */
function installDevtools(instance: any): void {
  const api = {
    getSnapshot: () => buildSnapshot(instance),
    getDiagnostics,
    clearDiagnostics,
    onDiagnostic,
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
