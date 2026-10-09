import { getInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';

/**
 * 注入 CSS 样式表。`remoteName` 会写到 `data-linkjs-remote`，便于卸载时回收。
 */
function loadCss(url: string, remoteName?: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`link[rel="stylesheet"][href="${url}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    if (remoteName) {
      link.dataset.linkjsRemote = remoteName;
    }
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`[linkjs] Failed to load stylesheet: ${url}`);
      resolve();
    };
    document.head.appendChild(link);
  });
}

/**
 * 预加载 module（仅缓存，不执行）
 */
function preloadModule(url: string, remoteName?: string): void {
  if (document.querySelector(`link[rel="modulepreload"][href="${url}"]`)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = url;
  if (remoteName) {
    link.dataset.linkjsRemote = remoteName;
  }
  document.head.appendChild(link);
}

interface LoadScriptOptions {
  /** 加载失败时是否忽略（默认 false，即 reject） */
  ignoreError?: boolean;
  /** 归属的远程应用名，写到 data-linkjs-remote 便于卸载 */
  remoteName?: string;
}

/**
 * 以 `<script type="module">` 方式加载远程脚本。
 * 默认加载失败会 reject，便于上层感知并重试/报错。
 */
function loadScript(url: string, options?: LoadScriptOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (url.includes('@vite/client')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.type = 'module';
    if (options?.remoteName) {
      script.dataset.linkjsRemote = options.remoteName;
    }
    script.onload = () => resolve();
    script.onerror = () => {
      const error = new Error(`Failed to load script: ${url}`);
      if (options?.ignoreError) {
        console.warn(`[linkjs] ${error.message}, but continuing`);
        resolve();
      } else {
        reject(error);
      }
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

export interface ExtOption {
  timeoutId?: ReturnType<typeof setTimeout>;
  modelName?: string;
}

function useHandleExpose<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  resolve: (value: Module | null) => void,
  appName: string,
  options: ExtOption,
) {
  return (data: { libName: string; lib: Module | Record<string, Module> }) => {
    return handleLibExpose<Module>(data, resolve, remoteCache, appName, options);
  };
}

function handleLibExpose<Module>(
  data: { libName: string; lib: Module | Record<string, Module> },
  resolve: (value: Module | null) => void,
  remoteCache: Map<string, Record<string, Module> | Module>,
  appName: string,
  options: ExtOption,
) {
  const linkInstance = getInstance();
  if (data.libName === appName && data.lib) {
    linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
    const { modelName } = options;
    if (options.timeoutId) {
      clearTimeout(options.timeoutId);
    }
    remoteCache.set(appName, data.lib);
    console.log(`Remote module ${appName} cached`);
    if (modelName) {
      return resolve((data.lib as Record<string, Module>)[modelName] || null);
    } else {
      return resolve((data.lib as Record<string, Module>)['default'] || (data.lib as Module) || null);
    }
  }
}

export { loadCss, preloadModule, loadScript, getRemoteInfo, useGetRemote, useHandleExpose };
