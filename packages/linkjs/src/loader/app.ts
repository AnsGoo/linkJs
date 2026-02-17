import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { loadScript, useGetRemote, useHandleExpose, type ExtOption } from './utils';

function useLoadApp<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string, options?: { host?: string; preload?: string[] }) => loadApp(remoteCache, entry, options);
}

function loadApp<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  entry: string,
  options?: { host?: string; preload?: string[] },
): Promise<Module | null> {
  // 检查缓存中是否已经存在该模块
  const [appName, modelName] = entry.split('/');
  const appModule = useGetRemote(remoteCache)(entry);
  if (appModule) {
    return Promise.resolve(appModule as Module);
  }

  return new Promise((resolve, reject) => {
    const linkInstance = getInstance();

    // 监听子模块暴露事件
    const extOption: ExtOption = { modelName };
    const handleLibExpose = useHandleExpose(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);
    const remoteInfo = linkInstance.remotes.get(appName);
    const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;

    const preload = options?.preload || remoteInfo?.dependencies || {};
    Promise.all(
      Object.keys(preload).map((libName) => {
        return loadShare(libName);
      }),
    );

    // 加载远程 HTML
    fetch(host)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load remote: ${response.statusText}`);
        }
        return response.text();
      })
      .then((html) => {
        // 解析 HTML，提取资源
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 加载 CSS 资源
        // const styleSheets = doc.querySelectorAll('link[rel="stylesheet"]');
        // styleSheets.forEach(link => {
        //     const href = link.getAttribute('href');
        //     if (href) {
        //         const absoluteUrl = new URL(href, host).href;
        //         loadCss(absoluteUrl);
        //     }
        // });

        // 加载 JS 资源
        const scripts = doc.querySelectorAll('script[src]');
        const scriptPromises = Array.from(scripts).map((script) => {
          const src = script.getAttribute('src');
          if (src) {
            const absoluteUrl = new URL(src, host).href;
            return loadScript(absoluteUrl);
          }
          return Promise.resolve();
        });

        // 等待所有脚本加载完成
        Promise.all(scriptPromises)
          .then(() => {
            // 脚本加载完成，等待子模块触发 LIB_EXPOSE 事件
            // 设置超时，如果子模块没有及时触发事件，则超时
            extOption.timeoutId = setTimeout(() => {
              linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
              reject(new Error(`Timeout waiting for module ${appName} to expose`));
            }, 10000); // 10秒超时
          })
          .catch((error) => {
            linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
            reject(error);
          });
      })
      .catch((error) => {
        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
        reject(error);
      });
  });
}

export { useLoadApp };
