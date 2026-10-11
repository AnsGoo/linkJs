import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import { clearRemoteCache, getRemote, loadApp, loadLib, loadRemote, registerRemote, unloadRemote, unloadLib } from './loader';

import { loadOverride, overrideRemote } from './override';
import { expose, shared } from './expose';
import { loadShare, registerShare, getShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import { registerPlugin, runInitHooks, type RuntimePlugin } from './plugins';
import { subscribeRemoteUpdate } from './hmr';
import { loadRuntime } from './runtime';
import { preloadRemote } from './preload';

function getInstance() {
  return linkInstance;
}

type InstanceMode = 'development' | 'production';

interface UserOption {
  shareStrategy?: 'version-first' | 'loaded-first';
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugin?: RuntimePlugin | RuntimePlugin[];
  /** 宿主构建模式，决定子应用框架 runtime 走共享（dev）还是本地（prod）。默认自动探测。 */
  mode?: InstanceMode;
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
  const { shareStrategy = 'version-first', remotes = [], shares = {}, plugin, mode } = options;
  remotes.forEach((remote) => {
    registerRemote(remote);
  });
  registerShare(shares);
  if (plugin) {
    registerPlugin(plugin);
  }
  linkInstance.shareStrategy = shareStrategy;
  linkInstance.mode = detectMode(mode);
  runInitHooks(options, linkInstance);
  return linkInstance;
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
};

export type { RegistryOption } from './state';
export type { RemoteUpdatePayload } from './hmr';
export type { LoadAppOptions } from './loader/app';
export type { LoadLibOptions } from './loader/lib';
export { registerPlugin, getPlugins } from './plugins';
export type { RuntimePlugin } from './plugins';
export type { EventBus, EventHandler, LinkjsEvents } from './event-bus';
export type { PreloadRemoteOptions, RemoteManifest, ManifestAsset } from './preload';

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
