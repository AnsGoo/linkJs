import { getInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { getShadowRoot } from '../sandbox/shadow';

/** 请求 URL 重写器（插件通过 `instance.requestRewriters` 注册）。 */
export type RequestRewriter = (url: string, ctx: { remoteName?: string }) => string | void;

/** 允许插件改写远程资源的请求 URL（鉴权 token、CDN 网关、路径映射等）。 */
function rewriteRequestUrl(url: string, remoteName?: string): string {
  const rewriters = (getInstance() as { requestRewriters?: RequestRewriter[] }).requestRewriters;
  if (!rewriters?.length) {
    return url;
  }
  let result = url;
  for (const rewriter of rewriters) {
    try {
      const next = rewriter(result, { remoteName });
      if (typeof next === 'string' && next) {
        result = next;
      }
    } catch {
      /* 单个重写器异常不影响其它 */
    }
  }
  return result;
}

/** 资源标签的安全属性（Subresource Integrity / CSP nonce）。 */
interface ResourceSecurityOptions {
  integrity?: string;
  crossOrigin?: string;
  nonce?: string;
}

/**
 * 注入 CSS 样式表。`remoteName` 会写到 `data-linkjs-remote`，便于卸载时回收。
 * 若该远程已启用 Shadow DOM 隔离，则直接注入其影子树。
 */
function loadCss(url: string, remoteName?: string, security: ResourceSecurityOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`link[rel="stylesheet"][href="${url}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = rewriteRequestUrl(url, remoteName);
    if (security.integrity) {
      link.integrity = security.integrity;
    }
    if (security.crossOrigin) {
      link.crossOrigin = security.crossOrigin;
    }
    if (security.nonce) {
      link.nonce = security.nonce;
    }
    if (remoteName) {
      link.dataset.linkjsRemote = remoteName;
    }
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`[linkjs] Failed to load stylesheet: ${url}`);
      resolve();
    };
    const target = remoteName ? getShadowRoot(remoteName) : undefined;
    (target ?? document.head).appendChild(link);
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
  link.href = rewriteRequestUrl(url, remoteName);
  if (remoteName) {
    link.dataset.linkjsRemote = remoteName;
  }
  document.head.appendChild(link);
}

interface LoadScriptOptions extends ResourceSecurityOptions {
  /** 加载失败时是否忽略（默认 false，即 reject） */
  ignoreError?: boolean;
  /** 归属的远程应用名，写到 data-linkjs-remote 便于卸载 */
  remoteName?: string;
}

/**
 * 以 `<script type="module">` 方式加载远程脚本。
 * 默认加载失败会 reject，便于上层感知并重试/报错。
 * 支持透传 `integrity` / `crossOrigin` / `nonce`（SRI / CSP）。
 */
function loadScript(url: string, options?: LoadScriptOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (url.includes('@vite/client')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = rewriteRequestUrl(url, options?.remoteName);
    script.type = 'module';
    if (options?.integrity) {
      script.integrity = options.integrity;
    }
    if (options?.crossOrigin) {
      script.crossOrigin = options.crossOrigin;
    }
    if (options?.nonce) {
      script.nonce = options.nonce;
    }
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

export { loadCss, preloadModule, loadScript, rewriteRequestUrl, getRemoteInfo, useGetRemote, useHandleExpose };
export type { LoadScriptOptions, ResourceSecurityOptions };
