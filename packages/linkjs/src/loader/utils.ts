import { getInstance } from "..";

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


function getRemoteInfo(name: string) {
  const instance = getInstance();
  return instance.remotes.get(name);
}


export { loadCss, loadScript, getRemoteInfo };
