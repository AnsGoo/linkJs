import type Module from 'module';
import { getInstance } from '..';
import { LOAD_STATUS } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote } from './utils';
import { useLoadRemoteLib } from './lib';
import { useLoadApp, type LoadAppOptions } from './app';
import { deactivateAllSandboxes, deactivateSandbox } from '../sandbox';

// 缓存已加载的远程模块
const remoteCache = new Map<string, Record<string, Module> | Module>();

function loadApp(entry: string, options?: LoadAppOptions): Promise<Module | null> {
  return useLoadApp(remoteCache)(entry, options) as Promise<Module | null>;
}

function getRemote<Module>(entry: string) {
  return useGetRemote<Module>(remoteCache as any)(entry);
}

/**
 * 清除远程模块缓存。仅清除运行时缓存，不会移除已注入的 DOM 资源（用 unloadRemote）。
 */
function clearRemoteCache(appName?: string): void {
  if (appName) {
    remoteCache.delete(appName);
    console.log(`Remote cache for ${appName} cleared`);
  } else {
    remoteCache.clear();
    console.log('All remote cache cleared');
  }
}

/**
 * 卸载远程应用：清除缓存，并移除该远程注入的 `<script>`/`<link>` 标签。
 *
 * 注意：已执行的 JS 模块与已创建的 Vue 实例无法被真正回收，
 * 业务侧仍需自行卸载组件、解绑事件与清理副作用。
 */
function unloadRemote(appName?: string): void {
  clearRemoteCache(appName);
  if (appName) {
    deactivateSandbox(appName);
  } else {
    deactivateAllSandboxes();
  }
  if (typeof document === 'undefined') {
    return;
  }
  const selector = appName ? `[data-linkjs-remote="${appName}"]` : '[data-linkjs-remote]';
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function loadLib(entry: string, options?: { host?: string; entryName?: string }): Promise<Module | null> {
  return useLoadRemoteLib(remoteCache)(entry, options);
}

function loadRemote(
  entry: string,
  options?: LoadAppOptions & { entryName?: string },
): Promise<Module | Record<string, Module> | null> {
  const [appName] = entry.split('/');
  const remoteInfo = getRemoteInfo(appName);
  if (!remoteInfo) {
    return Promise.reject(new Error(`Remote module ${appName} not found`));
  }
  if (remoteInfo.type === 'lib') {
    return loadLib(entry, options);
  }
  if (remoteInfo.type === 'app') {
    return loadApp(entry, options);
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

export { loadApp, getRemote, clearRemoteCache, unloadRemote, loadLib, registerRemote, getRemoteInfo, loadRemote };
