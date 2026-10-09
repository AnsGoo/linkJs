import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import { clearRemoteCache, getRemote, loadApp, loadLib, loadRemote, registerRemote, unloadRemote } from './loader';

import { loadOverride, overrideRemote } from './override';
import { expose, shared } from './expose';
import { loadShare, registerShare, getShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import { registerPlugin, type RuntimePlugin } from './plugins';

function getInstance() {
  return linkInstance;
}

interface UserOption {
  shareStrategy?: 'version-first' | 'loaded-first';
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugin?: RuntimePlugin;
}

function createInstance(options: UserOption) {
  const { shareStrategy = 'version-first', remotes = [], shares = {}, plugin } = options;
  remotes.forEach((remote) => {
    registerRemote(remote);
  });
  registerShare(shares);
  if (plugin) {
    registerPlugin(plugin);
  }
  linkInstance.shareStrategy = shareStrategy;
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
};

export type { RegistryOption } from './state';

export {
  captureSnapshot,
  restoreSnapshot,
  activateSandbox,
  deactivateSandbox,
  deactivateAllSandboxes,
} from './sandbox';
export type { SandboxSnapshot } from './sandbox';
