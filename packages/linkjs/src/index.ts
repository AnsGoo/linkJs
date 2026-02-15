import { linkInstance } from './state';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from './constant';
import { clearRemoteCache, getRemote, loadApp, loadLib, registerRemote } from './loader';

import { loadOverride, overrideRemote } from './override';
import { exposeLib } from './expose';
import { loadShare, registerShare } from './share';
import type { ShareOption } from './share';
import type { RmoteConfig } from './loader';
import { registerPlugins, type RuntimePlugin } from './plugins';

function getInstance() {
  return linkInstance;
}

interface UserOption {
  remotes?: Array<RmoteConfig>;
  shares?: Record<string, ShareOption>;
  plugins?: Array<RuntimePlugin>;
}

function createInstance(options: UserOption) {
  const { remotes = [], shares = {}, plugins = [] } = options;
  remotes.forEach((remote) => {
    registerRemote(remote);
  });
  registerShare(shares);
  registerPlugins(plugins);
  return linkInstance;
}

export {
  getInstance,
  createInstance,
  loadApp,
  exposeLib,
  getRemote,
  clearRemoteCache,
  loadLib,
  registerShare,
  loadShare,
  loadOverride,
  overrideRemote,
};

export type { RegistryOption } from './state';
