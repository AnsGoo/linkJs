import type Module from 'module';
import { getInstance } from '..';

interface ShareOptions {
  version?: string;
  scope?: string;
  lib: Module | (() => Promise<Module>) | (() => Module);
}

function bindShare(name: string, libModule: Module) {
  // @ts-ignore
  window[name] = libModule;
}

function registerShare(options: Record<string, ShareOptions>) {
  for (const name in options) {
    const option = options[name];
    const instance = getInstance();
    instance.shares.set(name, option);
  }
}

async function loadShare(name: string) {
  const instance = getInstance();
  // @ts-ignore
  if (window[name]) {
    // @ts-ignore
    return Promise.resolve(window[name]);
  }
  if (!instance.shares.has(name)) {
    return Promise.resolve(null);
  }
  const option = instance.shares.get(name);
  let libModule: Module = option.lib;
  if (typeof option.lib === 'function') {
    const libload = await option.lib();
    if (libload instanceof Promise) {
      libModule = await libload;
    } else {
      libModule = libload;
    }
  }
  bindShare(name, libModule);
  return libModule;
}

export { registerShare, loadShare };
