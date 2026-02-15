import type Module from 'module';
import { getInstance } from '..';
import { LOAD_STATUS } from '../event-bus/constant';
import { getRemoteInfo } from './utils';
import { useLoadRemoteLib } from './lib';
import { useLoadApp } from './app';



// 缓存已加载的远程模块
const remoteCache = new Map<string, Record<string, Module> | Module>();

function loadApp(entry: string, options?: { host?: string; preload?: string[] }): Promise<Module | null> {
  return useLoadApp(remoteCache)(entry, options);
}

function getRemote(entry: string) {
  const [appName, modelName] = entry.split('/');
  const appModule = remoteCache.get(appName);
  return (appModule as Record<string, Module> | undefined)?.[modelName || 'default'] || appModule || null;
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


function loadLib(entry: string, options?: { host?: string; entryName?: string }): Promise<Module | Record<string, Module> | null> {
  return useLoadRemoteLib(remoteCache)(entry, options);
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

export { loadApp, getRemote, clearRemoteCache, loadLib, registerRemote, getRemoteInfo };
