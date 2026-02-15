import { getInstance, loadShare } from "..";
import { LIB_EXPOSE } from "../event-bus/constant";
import { getRemoteInfo } from "./utils";


export function useLoadRemoteLib<Module>(remoteCache: Map<string, Record<string, Module>|Module>) {
  return (entry: string, options?: { host?: string; entryName?: string }) => loadRemoteLib(remoteCache, entry, options);
}

function loadRemoteLib<Module>(remoteCache: Map<string, Module>, entry: string, options?: { host?: string; entryName?: string }): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  if (remoteCache.has(appName)) {
    console.log(`Remote module ${appName} already loaded, returning from cache`);
    const appModule = remoteCache.get(appName);
    if (!appModule) {
      return Promise.reject(new Error(`Remote module ${appName} not found in cache`));
    }
    if (modelName) {
      return Promise.resolve((appModule as Record<string, Module> | undefined)?.[modelName || modelName || 'default'] || null);
    } else {
      return Promise.resolve((appModule as Record<string, Module> | undefined)?.['default'] || appModule || null);
    }
  }

  return new Promise(async (resolve, reject) => {
    const linkInstance = getInstance();

    const handleLibExpose = (data: any) => {
      if (data.libName === appName && data.lib) {
        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
        remoteCache.set(appName, data.lib);
        console.log(`Remote module ${appName} cached`);
        if (modelName) {
          resolve(data.lib[modelName] || null);
        } else {
          resolve(data.lib['default'] || data.lib || null);
        }
      }
    };

    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);
    const remoteInfo = getRemoteInfo(appName);
    const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
    const entryName = options?.entryName || remoteInfo?.entry;
    const jsUrl = `${host}${entryName}`;

    const dependencies = remoteInfo?.dependencies || {};
    const depNames = Object.keys(dependencies);
    await Promise.all(depNames.map((dep) => loadShare(dep)));
    return import(jsUrl)
      .then((module) => {
        setTimeout(() => {
          linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
          reject(new Error(`Timeout waiting for module ${appName} to expose`));
        }, 10000);
      })
      .catch((error) => {
        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
        reject(error);
      });
  });
}