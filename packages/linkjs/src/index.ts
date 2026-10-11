import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import {
  clearRemoteCache,
  getRemote,
  loadApp as runLoadApp,
  loadLib as runLoadLib,
  loadRemote as runLoadRemote,
  registerRemote,
  unloadRemote,
  unloadLib,
} from './loader';

import { loadOverride, overrideRemote } from './override';
import { expose, shared } from './expose';
import { loadShare, registerShare, getShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import type { LoadAppOptions } from './loader/app';
import type { LoadLibOptions } from './loader/lib';
import { registerPlugin, runInitHooks, type RuntimePlugin } from './plugins';
import { subscribeRemoteUpdate } from './hmr';
import { loadRuntime } from './runtime';
import { preloadRemote } from './preload';
import {
  buildSnapshot,
  clearDiagnostics,
  getDiagnostics,
  installDevtools,
  maybeInstallDevtoolsUI,
  onDiagnostic,
  uninstallDevtoolsUI,
  type DevtoolsOptions,
} from './devtools';

function getInstance() {
  return linkInstance;
}

/** 当前 linkjs 实例的可观测快照（remotes / shares / plugins / diagnostics）。 */
function getSnapshot() {
  return buildSnapshot(linkInstance);
}

// 安装 DevTools 便于排查（全局 __LINKJS__ 与 $linkjs.debug）。
installDevtools(linkInstance);

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

/** 远程加载（经实例方法分发，可被插件包装）。 */
function loadApp<M = unknown>(entry: string, options?: LoadAppOptions): Promise<M | null> {
  ensureRuntimeMethods();
  return getInstance().loadApp(entry, options) as Promise<M | null>;
}
function loadLib<M = unknown>(entry: string, options?: LoadLibOptions): Promise<M | null> {
  ensureRuntimeMethods();
  return getInstance().loadLib(entry, options) as Promise<M | null>;
}
function loadRemote<M = unknown>(entry: string, options?: LoadAppOptions & LoadLibOptions): Promise<M | null> {
  ensureRuntimeMethods();
  return getInstance().loadRemote(entry, options) as Promise<M | null>;
}

type InstanceMode = 'development' | 'production';

interface UserOption {
  shareStrategy?: 'version-first' | 'loaded-first';
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugin?: RuntimePlugin | RuntimePlugin[];
  /** 宿主构建模式，决定子应用框架 runtime 走共享（dev）还是本地（prod）。默认自动探测。 */
  mode?: InstanceMode;
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
  const { shareStrategy = 'version-first', remotes = [], shares = {}, plugin, mode, devtools } = options;
  remotes.forEach((remote) => {
    registerRemote(remote);
  });
  registerShare(shares);
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
  loadOverride,
  overrideRemote,
  subscribeRemoteUpdate,
  loadRuntime,
  preloadRemote,
  getSnapshot,
  getDiagnostics,
  clearDiagnostics,
  onDiagnostic,
  installDevtoolsUI,
  uninstallDevtoolsUI,
};

export type { RegistryOption } from './state';
export type { RemoteUpdatePayload } from './hmr';
export type { LoadAppOptions } from './loader/app';
export type { LoadLibOptions } from './loader/lib';
export { registerPlugin, getPlugins } from './plugins';
export type { RuntimePlugin } from './plugins';
export { retryPlugin } from './plugins/retry';
export type { RetryPluginOptions } from './plugins/retry';
export type { EventBus, EventHandler, LinkjsEvents } from './event-bus';
export type { PreloadRemoteOptions, RemoteManifest, ManifestAsset } from './preload';
export type { Diagnostic, LinkjsSnapshot, RemoteSnapshot, ShareSnapshot, ShareVersionSnapshot, DevtoolsOptions } from './devtools';

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
