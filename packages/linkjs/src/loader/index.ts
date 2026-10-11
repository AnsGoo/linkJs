import { getInstance } from '..';
import { LIB_EXPOSE, LOAD_STATUS, REMOTE_UPDATE } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote, type RemoteCache } from './utils';
import { useLoadRemoteLib, type LoadLibOptions } from './lib';
import { useLoadApp, type LoadAppOptions } from './app';
import { deactivateAllSandboxes, deactivateSandbox } from '../sandbox';
import { clearAppHmr, setupHmrIndexing } from '../hmr';
import type { RemoteModule } from '../types';

// 缓存已加载的远程模块
const remoteCache: RemoteCache = new Map();

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
  getInstance().eventBus.on(LIB_EXPOSE, (data: { libName: string; lib: RemoteModule; options?: unknown }) => {
    if (!data.libName || !data.lib) {
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

/** 更新远程应用的加载状态（若已注册）。 */
function setRemoteStatus(appName: string, status: (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS]): void {
  const remote = getInstance().remotes.get(appName) as { status?: string } | undefined;
  if (remote) {
    remote.status = status;
  }
}

function loadApp(entry: string, options?: LoadAppOptions): Promise<RemoteModule | null> {
  ensureRemoteUpdates();
  const appName = entry.split('/')[0];
  setRemoteStatus(appName, LOAD_STATUS.LOADING);
  return useLoadApp<RemoteModule>(remoteCache)(entry, options).then(
    (result) => {
      setRemoteStatus(appName, LOAD_STATUS.LOADED);
      return result;
    },
    (error) => {
      setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
      throw error;
    },
  );
}

function getRemote<M = unknown>(entry: string): M | null {
  return useGetRemote<M>(remoteCache)(entry);
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
    setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
  } else {
    deactivateAllSandboxes();
    getInstance().remotes.forEach((_remote: unknown, name: string) => setRemoteStatus(name, LOAD_STATUS.UNLOADED));
  }
  if (typeof document === 'undefined') {
    return;
  }
  const selector = appName ? `[data-linkjs-remote="${appName}"]` : '[data-linkjs-remote]';
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function loadLib(entry: string, options?: LoadLibOptions): Promise<RemoteModule | null> {
  ensureRemoteUpdates();
  const appName = entry.split('/')[0];
  setRemoteStatus(appName, LOAD_STATUS.LOADING);
  return useLoadRemoteLib<RemoteModule>(remoteCache)(entry, options).then(
    (result) => {
      setRemoteStatus(appName, LOAD_STATUS.LOADED);
      return result;
    },
    (error) => {
      setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
      throw error;
    },
  );
}

/**
 * 卸载远程库：清除缓存与 HMR 索引，并移除带 `data-linkjs-remote` 标记的资源。
 * 库以动态 `import()` 加载，已执行的模块无法真正回收，业务侧仍需自行清理组件副作用。
 */
function unloadLib(entry?: string): void {
  const appName = entry?.split('/')[0];
  clearRemoteCache(appName);
  clearAppHmr(appName);
  if (appName) {
    setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
  }
  if (typeof document === 'undefined') {
    return;
  }
  const selector = appName ? `[data-linkjs-remote="${appName}"]` : '[data-linkjs-remote]';
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function loadRemote(entry: string, options?: LoadAppOptions & { entryName?: string }): Promise<RemoteModule | null> {
  const [appName] = entry.split('/');
  const remoteInfo = getRemoteInfo(appName);
  if (!remoteInfo) {
    return Promise.reject(new Error(`Remote module ${appName} not found`));
  }
  const remoteType: string | undefined = remoteInfo.type;
  if (remoteType === 'lib') {
    return loadLib(entry, options);
  }
  if (remoteType === 'app') {
    return loadApp(entry, options);
  }
  return Promise.reject(new Error(`Remote module type ${remoteType} not supported`));
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
    name,
    entry,
    status: LOAD_STATUS.UNLOADED,
  });
}

export { loadApp, getRemote, clearRemoteCache, unloadRemote, unloadLib, loadLib, registerRemote, getRemoteInfo, loadRemote };
