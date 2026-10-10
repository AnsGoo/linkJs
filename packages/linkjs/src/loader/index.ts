import type Module from 'module';
import { getInstance } from '..';
import { LIB_EXPOSE, LOAD_STATUS, REMOTE_UPDATE } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote } from './utils';
import { useLoadRemoteLib } from './lib';
import { useLoadApp, type LoadAppOptions } from './app';
import { deactivateAllSandboxes, deactivateSandbox } from '../sandbox';
import { clearAppHmr, setupHmrIndexing } from '../hmr';

// 缓存已加载的远程模块
const remoteCache = new Map<string, Record<string, Module> | Module>();

let remoteUpdatesReady = false;

/**
 * 惰性初始化远程更新监听：
 * - 建立 hmrId -> 暴露槽位索引；
 * - 持久监听 LIB_EXPOSE：首次由 loadApp/loadLib 的 promise 解析处理；已在缓存中的
 *   appName 再次 expose（HMR 入口变化）则更新缓存并广播 REMOTE_UPDATE。
 *
 * 延迟到首次加载时执行，避免模块初始化期访问尚未就绪的 linkInstance（循环依赖）。
 */
function ensureRemoteUpdates(): void {
  if (remoteUpdatesReady) {
    return;
  }
  remoteUpdatesReady = true;
  setupHmrIndexing();
  getInstance().eventBus.on(LIB_EXPOSE, (data: { libName?: string; lib?: any } | undefined) => {
    if (!data || !data.libName || !data.lib) {
      return;
    }
    const isUpdate = remoteCache.has(data.libName);
    remoteCache.set(data.libName, data.lib);
    if (isUpdate) {
      console.log(`Remote module ${data.libName} re-exposed, broadcasting update`);
      getInstance().eventBus.emit(REMOTE_UPDATE, { appName: data.libName });
    }
  });
}

function loadApp(entry: string, options?: LoadAppOptions): Promise<Module | null> {
  ensureRemoteUpdates();
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
  clearAppHmr(appName);
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
  ensureRemoteUpdates();
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
