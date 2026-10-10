import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import { clearRemoteCache, getRemote, loadApp, loadLib, loadRemote, registerRemote, unloadRemote } from './loader';

import { loadOverride, overrideRemote } from './override';
import { expose, shared } from './expose';
import { loadShare, registerShare, getShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import { registerPlugin, type RuntimePlugin } from './plugins';
import { subscribeRemoteUpdate } from './hmr';
import { loadRuntime } from './runtime';

function getInstance() {
  return linkInstance;
}

type InstanceMode = 'development' | 'production';

interface UserOption {
  shareStrategy?: 'version-first' | 'loaded-first';
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugin?: RuntimePlugin;
  /** 宿主构建模式，决定子应用框架 runtime 走共享（dev）还是本地（prod）。默认自动探测。 */
  mode?: InstanceMode;
}

function detectMode(explicit?: InstanceMode): InstanceMode {
  if (explicit) {
    return explicit;
  }
  const env = (import.meta as any)?.env;
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
  loadLib,
  loadRemote,
  registerShare,
  getShare,
  loadShare,
  loadOverride,
  overrideRemote,
  subscribeRemoteUpdate,
  loadRuntime,
};

export type { RegistryOption } from './state';
export type { RemoteUpdatePayload } from './hmr';
export type { LoadAppOptions } from './loader/app';
export type { LoadLibOptions } from './loader/lib';

export {
  captureSnapshot,
  restoreSnapshot,
  activateSandbox,
  deactivateSandbox,
  deactivateAllSandboxes,
} from './sandbox';
export type { SandboxSnapshot } from './sandbox';
