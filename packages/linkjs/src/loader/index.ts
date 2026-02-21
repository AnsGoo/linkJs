import type Module from 'module';
import { getInstance } from '..';
import { LOAD_STATUS } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote } from './utils';
import { useLoadRemoteLib } from './lib';
import { useLoadApp } from './app';

// 缓存已加载的远程模块
const remoteCache = new Map<string, Record<string, Module> | Module>();

function loadApp(entry: string, options?: { host?: string; preload?: string[] }): Promise<Module | null> {
  return useLoadApp(remoteCache)(entry, options);
}

function getRemote<Module>(entry: string) {
  return useGetRemote<Module>(remoteCache as any)(entry);
}

// 清除远程模块缓存
function clearRemoteCache(appName?: string): void {
  if (appName) {
    remoteCache.delete(appName);
    console.log(`Remote cache for ${appName} cleared`);
  } else {
    remoteCache.clear();
    console.log('All remote cache cleared');
  }
}

function loadLib(entry: string, options?: { host?: string; entryName?: string }): Promise<Module | null> {
  return useLoadRemoteLib(remoteCache)(entry, options);
}

function loadRemote(entry: string, options?: { host?: string; preload?: string[] }): Promise<Module | Record<string, Module> | null> {
  const [appName, _] = entry.split('/');
  const remoteInfo = getRemoteInfo(appName);
  if (!remoteInfo) {
    return Promise.reject(new Error(`Remote module ${appName} not found`));
  }
  if (remoteInfo.type === 'app') {
    return loadApp(entry, options);
  } else if (remoteInfo.type === 'lib') {
    return loadLib(entry, options);
  }
  return Promise.reject(new Error(`Remote module type ${remoteInfo.type} not supported`));
}

export interface RmoteConfig {
  name: string;
  entry: string;
}

function registerRemote(option: RmoteConfig) {
  const { name, entry } = option;
  const instance = getInstance();
  if (instance.remotes.has(name)) {
    return;
  }
  instance.remotes.set(name, {
    entry,
    status: LOAD_STATUS.UNLOADED,
  });
}

export { loadApp, getRemote, clearRemoteCache, loadLib, registerRemote, getRemoteInfo, loadRemote };
