import { getInstance } from '..';
import { LIB_EXPOSE, LOAD_STATUS, REMOTE_UPDATE } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote, type RemoteCache } from './utils';
import { useLoadRemoteLib, type LoadLibOptions } from './lib';
import { useLoadApp, type LoadAppOptions } from './app';
import { resolveRemoteDeps, releaseRemote, type ResolveDepsContext } from './deps';
import type { RemoteDependency } from '../state/instance';
import type { LoadOptions } from './options';
import { deactivateAllSandboxes, deactivateSandbox } from '../sandbox';
import { disposeShadowTarget } from '../sandbox/shadow';
import { clearAppHmr, setupHmrIndexing } from '../hmr';
import type { RemoteModule } from '../types';

// 已加载远程模块缓存：挂到实例上（而非模块级），使远程 bundle 内的 `getRemote` 与本实例共用同一缓存，
// 从而支持 remote → remote 消费（跨 bundle/多份 linkjs 模块副本）。
function remoteCache(): RemoteCache {
  return (getInstance().remoteCache ??= new Map<string, RemoteModule>());
}

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
    const isUpdate = remoteCache().has(data.libName);
    remoteCache().set(data.libName, data.lib);
    if (isUpdate) {
      console.log(`Remote module ${data.libName} re-exposed, broadcasting update`);
      getInstance().eventBus.emit(REMOTE_UPDATE, { appName: data.libName });
    }
  });
}

/** 更新远程应用的加载状态（若已注册）。 */
function setRemoteStatus(appName: string, status: (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS]): void {
  const remote = getInstance().remotes.get(appName);
  if (remote) {
    remote.status = status;
  }
}

/** 拓扑加载某远程声明的全部远程依赖（`deps:false` 时跳过）。 */
function resolveDepsFor(appName: string, options?: { deps?: boolean }): Promise<void> {
  if (options?.deps === false) {
    return Promise.resolve();
  }
  const instance = getInstance();
  const ctx: ResolveDepsContext = {
    stack: [appName],
    inflight: (instance.remoteInflight ??= new Map()),
    loadOne: loadOneRemote,
  };
  return resolveRemoteDeps(appName, ctx);
}

/** 按被依赖远程的注册类型选择 loadApp / loadLib（不再递归解析其依赖）。 */
function loadOneRemote(name: string, dep: RemoteDependency): Promise<unknown> {
  const info = getRemoteInfo(name);
  // 依赖默认按 shadow 加载：每个远程的样式落到**它自己的影子树**，避免同一远程
  // 在不同消费者/不同顺序下样式落点不一致而丢失。
  const options: LoadOptions = { deps: false, shadow: true };
  if (dep.host) {
    options.host = dep.host;
  }
  if (info?.type === 'lib') {
    if (dep.entryName) {
      options.entryName = dep.entryName;
    }
    return loadLib(name, options);
  }
  if (dep.entryName) {
    options.entry = dep.entryName;
  }
  return loadApp(name, options);
}

function loadApp(entry: string, options?: LoadAppOptions): Promise<RemoteModule | null> {
  ensureRemoteUpdates();
  const appName = entry.split('/')[0];
  return resolveDepsFor(appName, options).then(() => {
    setRemoteStatus(appName, LOAD_STATUS.LOADING);
    return useLoadApp<RemoteModule>(remoteCache())(entry, options).then(
      (result) => {
        setRemoteStatus(appName, LOAD_STATUS.LOADED);
        return result;
      },
      (error) => {
        setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
        throw error;
      },
    );
  });
}

function getRemote<M = unknown>(entry: string): M | null {
  return useGetRemote<M>(remoteCache())(entry);
}

/**
 * 清除远程模块缓存。仅清除运行时缓存，不会移除已注入的 DOM 资源（用 unloadRemote）。
 */
function clearRemoteCache(appName?: string): void {
  if (appName) {
    remoteCache().delete(appName);
    console.log(`Remote cache for ${appName} cleared`);
  } else {
    remoteCache().clear();
    console.log('All remote cache cleared');
  }
}

/**
 * 卸载远程应用：清除缓存，并移除该远程注入的 `<script>`/`<link>` 标签。
 *
 * 注意：已执行的 JS 模块与已创建的 Vue 实例无法被真正回收，
 * 业务侧仍需自行卸载组件、解绑事件与清理副作用。
 */
/** 卸载依赖方时释放其远程依赖的引用计数，归零者递归卸载（调用内部卸载，避免重复释放）。 */
function releaseDependencies(appName: string): void {
  const deps = getRemoteInfo(appName)?.remotes ?? {};
  for (const depName of Object.keys(deps)) {
    if (releaseRemote(depName) > 0) {
      continue;
    }
    releaseDependencies(depName);
    if (getRemoteInfo(depName)?.type === 'lib') {
      doUnloadLib(depName);
    } else {
      doUnloadRemote(depName);
    }
  }
}

function unloadRemote(appName?: string): void {
  if (appName) {
    releaseDependencies(appName);
  }
  doUnloadRemote(appName);
}

function doUnloadRemote(appName?: string): void {
  clearRemoteCache(appName);
  clearAppHmr(appName);
  if (appName) {
    deactivateSandbox(appName);
    disposeShadowTarget(appName);
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
  return resolveDepsFor(appName, options).then(() => {
    setRemoteStatus(appName, LOAD_STATUS.LOADING);
    return useLoadRemoteLib<RemoteModule>(remoteCache())(entry, options).then(
      (result) => {
        setRemoteStatus(appName, LOAD_STATUS.LOADED);
        return result;
      },
      (error) => {
        setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
        throw error;
      },
    );
  });
}

/**
 * 卸载远程库：清除缓存与 HMR 索引，并移除带 `data-linkjs-remote` 标记的资源。
 * 库以动态 `import()` 加载，已执行的模块无法真正回收，业务侧仍需自行清理组件副作用。
 */
function unloadLib(entry?: string): void {
  const appName = entry?.split('/')[0];
  if (appName) {
    releaseDependencies(appName);
  }
  doUnloadLib(appName);
}

function doUnloadLib(appName?: string): void {
  clearRemoteCache(appName);
  clearAppHmr(appName);
  if (appName) {
    disposeShadowTarget(appName);
    setRemoteStatus(appName, LOAD_STATUS.UNLOADED);
  }
  if (typeof document === 'undefined') {
    return;
  }
  const selector = appName ? `[data-linkjs-remote="${appName}"]` : '[data-linkjs-remote]';
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function loadRemote(entry: string, options?: LoadOptions): Promise<RemoteModule | null> {
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
