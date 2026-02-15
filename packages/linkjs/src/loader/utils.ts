import { getInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';

function loadCss(url: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, _reject) => {
    if (url.includes('@vite/client')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    console.log(`Loading script: ${url}`);
    script.src = url;
    script.type = 'module';
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn(`Failed to load script: ${url}, but continuing`);
      resolve(); // 即使脚本加载失败也继续，避免整个加载过程失败
    };
    document.body.appendChild(script);
  });
}

function getRemoteInfo(name: string) {
  const instance = getInstance();
  return instance.remotes.get(name);
}

function useGetRemote<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string) => getRmoteFromCache<Module>(entry, remoteCache);
}

function getRmoteFromCache<Module>(entry: string, remoteCache: Map<string, Record<string, Module> | Module>) {
  const [appName, modelName] = entry.split('/');
  if (remoteCache.has(appName)) {
    console.log(`Remote module ${appName} already loaded, returning from cache`);
    const appModule = remoteCache.get(appName);
    if (!appModule) {
      console.warn(`Remote module ${appName} not found in cache, please load it first: loadRemote('${appName}')`);
      return null;
    }
    if (modelName) {
      return (appModule as Record<string, Module> | undefined)?.[modelName] || null;
    } else {
      return (appModule as Record<string, Module> | undefined)?.['default'] || (appModule as Module) || null;
    }
  }
}

function useHandleExpose<Module>(remoteCache: Map<string, Record<string, Module> | Module>, resolve: (value: Module | null) => void, appName: string, modelName?: string) {
  return (data: { libName: string; lib: Module | Record<string, Module> }, ) => {
    return handleLibExpose<Module>(data, resolve, remoteCache, appName, modelName);
  };
}

function handleLibExpose<Module>(
  data: { libName: string; lib: Module | Record<string, Module> },
  resolve: (value: Module | null) => void,
  remoteCache: Map<string, Record<string, Module> | Module>,
  appName: string,
  modelName?: string,
) {
  const linkInstance = getInstance();
  if (data.libName === appName && data.lib) {
    linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
    remoteCache.set(appName, data.lib);
    console.log(`Remote module ${appName} cached`);
    if (modelName) {
      return resolve((data.lib as Record<string, Module>)[modelName] || null);
    } else {
      return resolve((data.lib as Record<string, Module>)['default'] || (data.lib as Module) || null);
    }
  }
}

export { loadCss, loadScript, getRemoteInfo, useGetRemote, useHandleExpose };
