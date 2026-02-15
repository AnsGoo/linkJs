import type Module from 'module';
import { getInstance } from '..';

export interface ShareOption {
  alias?: string;
  version?: string;
  scope?: string;
  lib: Module | (() => Promise<Module>) | (() => Module);
}

function bindShare(name: string, libModule: Module) {
  // @ts-ignore
  globalThis[name] = libModule;
}

function registerShare(options: Record<string, ShareOption>) {
  for (const name in options) {
    const option = options[name];
    const instance = getInstance();
    if (instance.shares.has(name)) {
      continue;
    }
    instance.shares.set(name, option);
  }
}

async function loadShare(name: string) {
  const instance = getInstance();
  const shares = instance.shares;
  // @ts-ignore
  if (globalThis[name]) {
    // @ts-ignore
    return Promise.resolve(globalThis[name]);
  }
  if (!shares.has(name)) {
    return Promise.resolve(null);
  }
  const option = shares.get(name);
  let libModule: Module = option.lib;
  if (typeof option.lib === 'function') {
    const libload = await option.lib();
    if (libload instanceof Promise) {
      libModule = await libload;
    } else {
      libModule = libload;
    }
  }
  if (option.alias) {
    bindShare(option.alias, libModule);
  } else {
    bindShare(name, libModule);
  }
  return libModule;
}

function getShare(name: string) {
  const instance = getInstance();
  if (instance.shares.has(name)) {
    const shareInfo = instance.shares.get(name);
    if (shareInfo.alias) {
      return window[shareInfo.alias];
    }
    return window[shareInfo.name];
  }
  return null;
}

export { registerShare, loadShare, getShare };
