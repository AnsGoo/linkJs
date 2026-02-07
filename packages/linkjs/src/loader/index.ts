import { getLinkInstance } from "..";
import { LIB_EXPOSE } from "../event-bus/constant";

// 缓存已加载的远程模块
const remoteCache = new Map<string, any>();

function loadRemote(url: string, options: any): Promise<any> {
    // 检查缓存中是否已经存在该模块
    if (remoteCache.has(url)) {
        console.log(`Remote module ${url} already loaded, returning from cache`);
        return Promise.resolve(remoteCache.get(url));
    }
    
    return new Promise((resolve, reject) => {
        const linkInstance = getLinkInstance();
        const libName = options?.name || `remote-${Date.now()}`;
        
        // 监听子模块暴露事件
        const handleLibExpose = (data: any) => {
            if (data.libName === libName || !data.libName) {
                linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
                // 缓存模块实例
                remoteCache.set(url, data.lib);
                console.log(`Remote module ${url} cached`);
                resolve(data.lib);
            }
        };
        
        linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);
        
        // 加载远程 HTML
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load remote: ${response.statusText}`);
                }
                return response.text();
            })
            .then(html => {
                // 解析 HTML，提取资源
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // 加载 CSS 资源
                const styleSheets = doc.querySelectorAll('link[rel="stylesheet"]');
                styleSheets.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                        const absoluteUrl = new URL(href, url).href;
                        loadCss(absoluteUrl);
                    }
                });
                
                // 加载 JS 资源
                const scripts = doc.querySelectorAll('script[src]');
                const scriptPromises = Array.from(scripts).map(script => {
                    const src = script.getAttribute('src');
                    if (src) {
                        const absoluteUrl = new URL(src, url).href;
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
                            reject(new Error(`Timeout waiting for module ${libName} to expose`));
                        }, 10000); // 10秒超时
                    })
                    .catch(error => {
                        linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
                        reject(error);
                    });
            })
            .catch(error => {
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
        const script = document.createElement('script');
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

export { loadRemote };