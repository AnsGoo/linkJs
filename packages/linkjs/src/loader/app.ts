import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { activateSandbox } from '../sandbox';
import { installVueHmrRuntimeShim } from '../hmr';
import { beginStyleCapture, endStyleCapture, ensureShadowTarget } from '../sandbox/shadow';
import { runBeforeLoadRemote, runHook } from '../plugins';
import { loadCss, loadScript, preloadModule, useGetRemote, useHandleExpose, type ExtOption, type LoadScriptOptions } from './utils';

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
  /** 是否启用快照沙箱：加载前快照全局，unloadRemote 时回滚子应用对全局的增改 */
  sandbox?: boolean;
  /** 是否启用 Shadow DOM 样式隔离（仅 `createRemoteApp` 消费）。 */
  shadow?: boolean;
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

async function loadScriptWithRetry(url: string, retries: number, options: LoadScriptOptions = {}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await loadScript(url, options);
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
  // 插件可改写 remoteInfo（host/entry/shared 等）
  const remoteInfo = (await runBeforeLoadRemote({ ...(linkInstance.remotes.get(appName) as any) })) as any;
  await runHook('afterResolve', remoteInfo);
  await runHook('beforeLoadContainer', remoteInfo);

  const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
  const entryPath = options?.entry || remoteInfo?.entry?.html || '';
  const htmlUrl = entryPath ? new URL(entryPath, host).href : host;
  const timeout = options?.timeout ?? 10000;
  const retries = options?.retries ?? 0;
  const preload = options?.preload || remoteInfo?.shared || {};

  const extOption: ExtOption = { modelName };

  // Shadow DOM 隔离：在脚本执行前建立游离影子目标并开启样式捕获，
  // 即便宿主是「先预加载、后挂载容器」，子应用注入的样式也会进入影子树。
  if (options?.shadow) {
    ensureShadowTarget(appName);
    beginStyleCapture(appName);
  }

  // 预加载共享依赖（等待完成，避免与子应用加载竞态）；支持远程声明多个共享作用域。
  const shareScopes: (string | undefined)[] = remoteInfo?.shareScope?.length ? remoteInfo.shareScope : [undefined];
  await Promise.all(
    Object.keys(preload).flatMap((libName) =>
      shareScopes.map(async (shareScope) => {
        await runHook('beforeLoadShare', libName);
        const mod = await loadShare(libName, shareScope ? { scope: shareScope } : undefined).catch(() => null);
        await runHook('afterLoadShare', libName, mod);
      }),
    ),
  );

  const html = await fetchHtml(htmlUrl, retries);

  await runHook('beforeLoadEntry', remoteInfo);

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

    // 远端为 dev（HTML 含 @vite/client）但宿主共享 Vue 为 prod（无真实 HMR runtime）时，
    // 安装 shim，让子应用的 SFC HMR 通过 linkjs 更新暴露槽位并通知宿主重渲染。
    if (html.includes('@vite/client')) {
      installVueHmrRuntimeShim();
    }

    // 解析 HTML，提取资源
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 加载 CSS 资源
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        loadCss(new URL(href, htmlUrl).href, appName, {
          integrity: link.getAttribute('integrity') || undefined,
          crossOrigin: link.getAttribute('crossorigin') || undefined,
          nonce: link.getAttribute('nonce') || undefined,
        });
      }
    });

    // 预加载 modulepreload 资源
    doc.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        preloadModule(new URL(href, htmlUrl).href, appName);
      }
    });

    // 快照沙箱：在注入脚本前记录全局状态，卸载时回滚
    if (options?.sandbox) {
      activateSandbox(appName);
    }

    // 加载 JS 资源
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    const scriptPromises = scripts.map((script) => {
      const src = script.getAttribute('src');
      if (!src) {
        return Promise.resolve();
      }
      return loadScriptWithRetry(new URL(src, htmlUrl).href, retries, {
        ignoreError: options?.ignoreScriptError,
        remoteName: appName,
        integrity: script.getAttribute('integrity') || undefined,
        crossOrigin: script.getAttribute('crossorigin') || undefined,
        nonce: script.getAttribute('nonce') || undefined,
      });
    });

    Promise.all(scriptPromises)
      .then(async () => {
        await runHook('afterLoadEntry', remoteInfo);
        // 脚本加载完成，等待子模块触发 LIB_EXPOSE 事件
        extOption.timeoutId = setTimeout(() => {
          rejectWith(new Error(`Timeout waiting for module ${appName} to expose`));
        }, timeout);
      })
      .catch((error) => {
        rejectWith(error);
      });
  }).then(
    // 子应用加载完成（或失败）后立即关闭捕获窗口：子应用样式此时已注入影子树，
    // 若不关闭会把宿主随后注入的样式也误收进影子树。
    (result) => {
      if (options?.shadow) {
        endStyleCapture();
      }
      void runHook('afterLoadContainer', remoteInfo, result);
      void runHook('onLoad', { appName, remoteInfo, module: result });
      void runHook('afterLoadRemote', remoteInfo, result);
      return result;
    },
    (error) => {
      if (options?.shadow) {
        endStyleCapture();
      }
      void runHook('errorLoadRemote', error, remoteInfo);
      throw error;
    },
  );
}

export { useLoadApp };
