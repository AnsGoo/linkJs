import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import {
  clearRemoteCache,
  getRemote as runGetRemote,
  loadApp as runLoadApp,
  loadLib as runLoadLib,
  loadRemote as runLoadRemote,
  registerRemote,
  unloadRemote,
  unloadLib,
} from './loader';

import { loadOverride, overrideRemote } from './override';
import { expose, shared } from './expose';
import { loadShare, loadShareSync, registerShare, getShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import type { LoadAppOptions } from './loader/app';
import type { LoadLibOptions } from './loader/lib';
import type { LoadOptions } from './loader/options';
import type { PublicPathResolver } from './loader/utils';
import { registerPlugin, runInitHooks, type RuntimePlugin } from './plugins';
import { subscribeRemoteUpdate } from './hmr';
import { loadRuntime } from './runtime';
import { preloadRemote } from './preload';
import { remoteSnapshot, globalSnapshot } from './snapshot';
import { selectRemoteSource, checkRemoteHealth, clearHealthCache } from './loader/source';
import {
  buildSnapshot,
  clearDiagnostics,
  clearEvents,
  getDiagnostics,
  getEvents,
  installDevtools,
  maybeInstallDevtoolsUI,
  onDiagnostic,
  uninstallDevtoolsUI,
  type DevtoolsOptions,
} from './devtools';

declare global {
  /**
   * 远程模块类型注册表。
   *
   * 由 `unplugin-linkjs` 的 `consumeTypes` 生成声明文件，通过**全局接口合并**增强：
   *
   * ```ts
   * interface LinkjsRemoteTypes {
   *   'remoteApp/HelloWorld': typeof import('remoteApp')['HelloWorld'];
   * }
   * ```
   *
   * 未接入时为空接口，`getRemote/loadLib/loadRemote` 自动回落到通用泛型签名。
   */
  interface LinkjsRemoteTypes {}
}

function getInstance() {
  return linkInstance;
}

/** 当前 linkjs 实例的可观测快照（remotes / shares / plugins / diagnostics）。 */
function getSnapshot() {
  return buildSnapshot(linkInstance);
}

// 安装 DevTools 便于排查（全局 __LINKJS__ 与 $linkjs.debug）。
installDevtools(linkInstance, {
  clearCache: clearRemoteCache,
  unload: unloadRemote,
  load: (entry, options) => loadRemote(entry, options as LoadOptions),
  preload: preloadRemote as (options: unknown) => Promise<unknown>,
  loadLib: (entry, options) => runLoadLib(entry, options as LoadLibOptions),
  unloadLib,
  getRemote: (entry) => runGetRemote(entry),
  getShare,
  loadShare,
});

// 运行时加载方法挂到实例，便于插件（如 retry）通过 `apply(instance)` 包装/扩展。
// 用惰性设置，避免循环导入期 linkInstance 尚未就绪。
function ensureRuntimeMethods(): void {
  const inst = getInstance();
  if (!inst) {
    return;
  }
  if (!inst.loadApp) {
    inst.loadApp = runLoadApp;
  }
  if (!inst.loadLib) {
    inst.loadLib = runLoadLib;
  }
  if (!inst.loadRemote) {
    inst.loadRemote = runLoadRemote;
  }
  const g = globalThis as { $linkjs?: Record<string, unknown> };
  if (g.$linkjs) {
    g.$linkjs.loadApp = loadApp;
    g.$linkjs.loadLib = loadLib;
    g.$linkjs.loadRemote = loadRemote;
  }
}

/**
 * 获取已加载的远程模块。
 *
 * 命中 `LinkjsRemoteTypes` 注册表时按字符串字面量推导类型；否则回退通用泛型 `M`。
 */
function getRemote<K extends keyof LinkjsRemoteTypes & string>(entry: K): LinkjsRemoteTypes[K] | null;
function getRemote<M = unknown>(entry: string): M | null;
function getRemote(entry: string): unknown {
  return runGetRemote(entry);
}

/** 远程加载（经实例方法分发，可被插件包装）。 */
function loadApp<M = unknown>(entry: string, options?: LoadAppOptions): Promise<M | null> {
  ensureRuntimeMethods();
  return getInstance().loadApp!(entry, options) as Promise<M | null>;
}
function loadLib<K extends keyof LinkjsRemoteTypes & string>(
  entry: K,
  options?: LoadLibOptions,
): Promise<LinkjsRemoteTypes[K] | null>;
function loadLib<M = unknown>(entry: string, options?: LoadLibOptions): Promise<M | null>;
function loadLib(entry: string, options?: LoadLibOptions): Promise<unknown> {
  ensureRuntimeMethods();
  return getInstance().loadLib!(entry, options);
}
function loadRemote<K extends keyof LinkjsRemoteTypes & string>(
  entry: K,
  options?: LoadOptions,
): Promise<LinkjsRemoteTypes[K] | null>;
function loadRemote<M = unknown>(entry: string, options?: LoadOptions): Promise<M | null>;
function loadRemote(entry: string, options?: LoadOptions): Promise<unknown> {
  ensureRuntimeMethods();
  return getInstance().loadRemote!(entry, options);
}

type InstanceMode = 'development' | 'production';

interface UserOption {
  shareStrategy?: 'version-first' | 'loaded-first';
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugin?: RuntimePlugin | RuntimePlugin[];
  /** 宿主构建模式，决定子应用框架 runtime 走共享（dev）还是本地（prod）。默认自动探测。 */
  mode?: InstanceMode;
  /** 全局动态基址解析器：为未单独配置 `publicPath`/`getPublicPath` 的远程解析 CDN 基址。 */
  getPublicPath?: PublicPathResolver;
  /** 页内 DevTools 面板：`false` 关闭；缺省时开发模式自动开启。 */
  devtools?: boolean | DevtoolsOptions;
}

function detectMode(explicit?: InstanceMode): InstanceMode {
  if (explicit) {
    return explicit;
  }
  // 注意：这里必须直接写 `import.meta.env`（不要用可选链 `?.env`），
  // 否则 Vite/esbuild 的 define 不会替换该 token，运行时拿不到值。
  const env = (import.meta as any).env;
  if (env && typeof env.DEV === 'boolean') {
    return env.DEV ? 'development' : 'production';
  }
  const proc = (globalThis as any)?.process;
  if (proc?.env?.NODE_ENV) {
    return proc.env.NODE_ENV === 'production' ? 'production' : 'development';
  }
  return 'production';
}

function createInstance(options: UserOption) {
  const { shareStrategy = 'version-first', remotes = [], shares = {}, plugin, mode, devtools, getPublicPath } = options;
  remotes.forEach((remote) => {
    registerRemote(remote);
  });
  registerShare(shares);
  if (getPublicPath) {
    linkInstance.getPublicPath = getPublicPath;
  }
  // 先就绪实例方法，插件（如 retry）的 apply 才能包装到加载方法。
  ensureRuntimeMethods();
  if (plugin) {
    registerPlugin(plugin);
  }
  linkInstance.shareStrategy = shareStrategy;
  linkInstance.mode = detectMode(mode);
  runInitHooks(options, linkInstance);
  // 开发模式下自动挂载页内 DevTools 面板。
  maybeInstallDevtoolsUI(linkInstance, devtools);
  return linkInstance;
}

/** 手动挂载页内 DevTools 面板。 */
function installDevtoolsUI(options?: DevtoolsOptions) {
  maybeInstallDevtoolsUI(linkInstance, options ?? { enabled: true });
}

export {
  getInstance,
  createInstance,
  loadApp,
  expose,
  shared,
  getRemote,
  clearRemoteCache,
  unloadRemote,
  unloadLib,
  loadLib,
  loadRemote,
  registerShare,
  getShare,
  loadShare,
  loadShareSync,
  loadOverride,
  overrideRemote,
  subscribeRemoteUpdate,
  loadRuntime,
  preloadRemote,
  remoteSnapshot,
  globalSnapshot,
  selectRemoteSource,
  checkRemoteHealth,
  clearHealthCache,
  getSnapshot,
  getDiagnostics,
  clearDiagnostics,
  onDiagnostic,
  getEvents,
  clearEvents,
  installDevtoolsUI,
  uninstallDevtoolsUI,
};

export type { RegistryOption, RemoteSource, RemoteSourceStrategy, RemoteHealthCheck } from './state';
export type { RemoteUpdatePayload } from './hmr';
export type { LoadAppOptions, LoadLibOptions, LoadOptions } from './loader/options';
export { registerPlugin, getPlugins } from './plugins';
export type { RuntimePlugin } from './plugins';
export { retryPlugin } from './plugins/retry';
export type { RetryPluginOptions } from './plugins/retry';
export { fallbackPlugin } from './plugins/fallback';
export type { FallbackPluginOptions } from './plugins/fallback';
export { loggerPlugin, getLoadMetrics, clearLoadMetrics } from './plugins/logger';
export type { LoggerPluginOptions, LoadMetric, LogEvent } from './plugins/logger';
export { authPlugin } from './plugins/auth';
export type { AuthPluginOptions } from './plugins/auth';
export { timeoutPlugin, TimeoutError } from './plugins/timeout';
export type { TimeoutPluginOptions } from './plugins/timeout';
export { availablePlugins } from './plugins/catalog';
export type { AvailablePlugin } from './plugins/catalog';
export type { EventBus, EventHandler, LinkjsEvents } from './event-bus';
export type { PreloadRemoteOptions, RemoteManifest, ManifestAsset, PrefetchRecord } from './preload';
export { clearPrefetchCache } from './preload';
export type { RemoteSnapshotEntry, GlobalSnapshot, RemoteLoadStatus } from './snapshot';
export type { Diagnostic, LinkjsSnapshot, RemoteSnapshot, ShareSnapshot, ShareVersionSnapshot, ShareConflict, PluginSnapshot, DevtoolsOptions, DevtoolsOps, EventSnapshot } from './devtools';
export { getPerfEntries, clearPerfEntries } from './perf';
export type { PerfEntry } from './perf';

export {
  captureSnapshot,
  restoreSnapshot,
  activateSandbox,
  deactivateSandbox,
  deactivateAllSandboxes,
} from './sandbox';
export type { SandboxSnapshot } from './sandbox';
export {
  createShadowIsolation,
  ensureShadowTarget,
  beginStyleCapture,
  endStyleCapture,
  getShadowRoot,
} from './sandbox/shadow';
export type { ShadowIsolation, ShadowTarget, CreateShadowIsolationOptions } from './sandbox/shadow';
