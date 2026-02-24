import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { getRemoteInfo, useGetRemote, useHandleExpose, type ExtOption } from './utils';

export function useLoadRemoteLib<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string, options?: { host?: string; entryName?: string }) => loadRemoteLib(remoteCache, entry, options);
}

function loadRemoteLib<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  entry: string,
  options?: { host?: string; entryName?: string },
): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  const appModule = useGetRemote(remoteCache)(entry);
  if (appModule) {
    return Promise.resolve(appModule as Module);
  }

  return new Promise(async (resolve, reject) => {
    const linkInstance = getInstance();
    const extOption: ExtOption = { modelName };
    const handleLibExpose = useHandleExpose(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);
    const plugin = linkInstance.plugin;
    let remoteInfo = getRemoteInfo(appName);
    if (plugin && plugin.beforeLoadRemote) {
      remoteInfo = await plugin.beforeLoadRemote({ ...remoteInfo });
    }
    const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
    const entryName = options?.entryName || remoteInfo?.entry.js;
    const jsUrl = `${host}${entryName}`;

    const shared = remoteInfo?.shared || {};
    const depNames = Object.keys(shared);
    await Promise.all(depNames.map((dep) => loadShare(dep)));

    const sharedEntry = remoteInfo?.entry?.shared;
    if (sharedEntry) {
      const sharedUrl = `${host}${sharedEntry}`;
      const t = await import(sharedUrl);
      console.log(t);
    }

    return import(jsUrl)
      .then((_module) => {
        extOption.timeoutId = setTimeout(() => {
          linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
          if (plugin && plugin.errorLoadRemote) {
            plugin.errorLoadRemote(resolve, reject);
          }
          reject(new Error(`Timeout waiting for module ${appName} to expose`));
        }, 10000);
      })
      .catch((error) => {
        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
        if (plugin && plugin.errorLoadRemote) {
          plugin.errorLoadRemote(resolve, reject);
        }
        reject(error);
      });
  });
}
