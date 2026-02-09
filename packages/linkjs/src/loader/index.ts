import type Module from 'module';
import { getLinkInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';

// 缓存已加载的远程模块
const remoteCache = new Map<string, any>();

function loadRemote(entry: string, options: { host?: string }): Promise<Module | null> {
  // 检查缓存中是否已经存在该模块
  const [appName, modelName] = entry.split('/');
  if (remoteCache.has(appName)) {
    console.log(`Remote module ${appName} already loaded, returning from cache`);
    const appModule = remoteCache.get(appName);
    if (!appModule) {
      return Promise.reject(new Error(`Remote module ${appName} not found in cache`));
    }
    if (modelName) {
      return Promise.resolve(appModule[modelName] || null);
    } else {
      return Promise.resolve(appModule['default'] || appModule || null);
    }
  }

  return new Promise((resolve, reject) => {
    const linkInstance = getLinkInstance();

    // 监听子模块暴露事件
    const handleLibExpose = (data: any) => {
      if (data.libName === appName && data.lib) {
        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
        // 缓存模块实例
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
    const host = (options.host = options.host || 'http://localhost:8080');

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
            setTimeout(() => {
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

function loadCss(url: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
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

function getRemote(entry: string) {
  const [appName, modelName] = entry.split('/');
  const appModule = remoteCache.get(appName);
  return appModule?.[modelName || 'default'] || appModule || null;
}

// 清除远程模块缓存
function clearRemoteCache(appName?: string): void {
  if (appName) {
    remoteCache.delete(appName);
    console.log(`Remote cache for ${appName} cleared`);
  } else {
    remoteCache.clear();
    console.log('All remote cache cleared');
  }
}

function loadRemoteLib(entry: string, options: { host?: string; entryName?: string }): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  if (remoteCache.has(appName)) {
    console.log(`Remote module ${appName} already loaded, returning from cache`);
    const appModule = remoteCache.get(appName);
    if (!appModule) {
      return Promise.reject(new Error(`Remote module ${appName} not found in cache`));
    }
    if (modelName) {
      return Promise.resolve(appModule[modelName] || null);
    } else {
      return Promise.resolve(appModule['default'] || appModule || null);
    }
  }

  return new Promise((resolve, reject) => {
    const linkInstance = getLinkInstance();

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
    const host = options.host || 'http://localhost:8080';
    const entryName = options.entryName || '/mf/index.js';
    const jsUrl = `${host}/${entryName}`;

    loadScript(jsUrl)
      .then(() => {
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

export { loadRemote, getRemote, clearRemoteCache, loadRemoteLib };
