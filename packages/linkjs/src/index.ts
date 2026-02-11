import { linkInstance } from './instance';
import { __LINKJS_INSTANCE__ } from './constant';
import { clearRemoteCache, getRemote, loadRemote, loadRemoteLib } from './loader';
import { exposeLib } from './expose';

// @ts-ignore
window[__LINKJS_INSTANCE__] = linkInstance;

function getInstance() {
  return linkInstance;
}

function createInstance(options: any = {}) {
  return linkInstance;
}

export { getInstance, createInstance, loadRemote, exposeLib, getRemote, clearRemoteCache, loadRemoteLib };
