import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote, useHandleExpose, type ExtOption } from './utils';

export interface LoadLibOptions {
  host?: string;
  entryName?: string;
  timeout?: number;
}

export function useLoadRemoteLib<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string, options?: LoadLibOptions) => loadRemoteLib(remoteCache, entry, options);
}

async function loadRemoteLib<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  entry: string,
  options?: LoadLibOptions,
): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  const cached = useGetRemote(remoteCache)(entry);
  if (cached) {
    return cached as Module;
  }

  const linkInstance = getInstance();
  const extOption: ExtOption = { modelName };
  const plugin = linkInstance.plugin;
  let remoteInfo = getRemoteInfo(appName) as any;
  if (plugin?.beforeLoadRemote) {
    remoteInfo = await plugin.beforeLoadRemote({ ...remoteInfo });
  }

  const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
  const entryName = options?.entryName || remoteInfo?.entry?.js;
  const jsUrl = `${host}${entryName}`;
  const timeout = options?.timeout ?? 10000;

  // 预加载该远程声明的共享依赖
  const shared = remoteInfo?.shared || {};
  await Promise.all(Object.keys(shared).map((dep) => loadShare(dep).catch(() => null)));

  // 加载共享依赖入口文件，注册远程提供的共享依赖。
  // 共享入口是可选产物，缺失或加载失败时不应阻塞主模块加载。
  const sharedEntry = remoteInfo?.entry?.shared;
  if (sharedEntry) {
    const sharedUrl = `${host}${sharedEntry}`;
    try {
      await import(/* @vite-ignore */ sharedUrl);
    } catch (error) {
      console.warn(`[linkjs] Failed to load shared entry "${sharedUrl}":`, error);
    }
  }

  return new Promise<Module | null>((resolve, reject) => {
    const handleLibExpose = useHandleExpose(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);

    const fail = (error: unknown) => {
      linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
      if (extOption.timeoutId) {
        clearTimeout(extOption.timeoutId);
      }
      if (plugin?.errorLoadRemote) {
        plugin.errorLoadRemote(resolve, reject);
      }
      reject(error);
    };

    import(/* @vite-ignore */ jsUrl)
      .then(() => {
        extOption.timeoutId = setTimeout(() => {
          fail(new Error(`Timeout waiting for module ${appName} to expose`));
        }, timeout);
      })
      .catch(fail);
  });
}
