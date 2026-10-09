import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { loadCss, loadScript, preloadModule, useGetRemote, useHandleExpose, type ExtOption } from './utils';

export interface LoadAppOptions {
  /** 远程应用基地址，例如 http://localhost:8081 */
  host?: string;
  /** 入口 HTML 路径（相对 host），默认使用 remoteInfo.entry.html 或 host 本身 */
  entry?: string;
  /** 需要预加载的共享依赖 */
  preload?: Record<string, any>;
  /** 等待 expose 的超时时间（毫秒），默认 10000 */
  timeout?: number;
  /** 网络/脚本加载失败重试次数，默认 0 */
  retries?: number;
  /** 单个脚本加载失败是否忽略，默认 false */
  ignoreScriptError?: boolean;
}

async function fetchHtml(url: string, retries: number): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load remote: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function loadScriptWithRetry(url: string, retries: number, ignoreError?: boolean, remoteName?: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await loadScript(url, { ignoreError, remoteName });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function useLoadApp<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string, options?: LoadAppOptions) => loadApp(remoteCache, entry, options);
}

async function loadApp<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  entry: string,
  options?: LoadAppOptions,
): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  const cached = useGetRemote(remoteCache)(entry);
  if (cached) {
    return cached as Module;
  }

  const linkInstance = getInstance();
  const remoteInfo = linkInstance.remotes.get(appName) as any;

  const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
  const entryPath = options?.entry || remoteInfo?.entry?.html || '';
  const htmlUrl = entryPath ? new URL(entryPath, host).href : host;
  const timeout = options?.timeout ?? 10000;
  const retries = options?.retries ?? 0;
  const preload = options?.preload || remoteInfo?.shared || {};

  const extOption: ExtOption = { modelName };

  // 预加载共享依赖（等待完成，避免与子应用加载竞态）
  await Promise.all(Object.keys(preload).map((libName) => loadShare(libName).catch(() => null)));

  const html = await fetchHtml(htmlUrl, retries);

  return new Promise<Module | null>((resolve, reject) => {
    const handleLibExpose = useHandleExpose(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);

    const rejectWith = (error: unknown) => {
      linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
      if (extOption.timeoutId) {
        clearTimeout(extOption.timeoutId);
      }
      reject(error);
    };

    // 解析 HTML，提取资源
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 加载 CSS 资源
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        loadCss(new URL(href, htmlUrl).href, appName);
      }
    });

    // 预加载 modulepreload 资源
    doc.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        preloadModule(new URL(href, htmlUrl).href, appName);
      }
    });

    // 加载 JS 资源
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    const scriptPromises = scripts.map((script) => {
      const src = script.getAttribute('src');
      if (!src) {
        return Promise.resolve();
      }
      return loadScriptWithRetry(new URL(src, htmlUrl).href, retries, options?.ignoreScriptError, appName);
    });

    Promise.all(scriptPromises)
      .then(() => {
        // 脚本加载完成，等待子模块触发 LIB_EXPOSE 事件
        extOption.timeoutId = setTimeout(() => {
          rejectWith(new Error(`Timeout waiting for module ${appName} to expose`));
        }, timeout);
      })
      .catch((error) => {
        rejectWith(error);
      });
  });
}

export { useLoadApp };
