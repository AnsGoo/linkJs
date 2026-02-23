import { getInstance } from '..';
import { __LINKJS_OVERRIDES__ } from '../constant';
import { LOAD_STATUS } from '../event-bus/constant';

function overrideRemote() {
  const overridesContent = localStorage.getItem(__LINKJS_OVERRIDES__);
  const overridePromises: Array<Promise<void>> = [];
  if (overridesContent) {
    let content;
    try {
      content = JSON.parse(overridesContent);
    } catch (error) {
      console.error(`Error parsing overrides:`, error);
      throw error;
    }
    const overrideKeys = Object.keys(content || []);
    (overrideKeys || []).forEach((name: string) => {
      const host = content[name];
      if (host && typeof host === 'string' && (host.startsWith('http') || host.startsWith('https'))) {
        overridePromises.push(loadOverride({ name, host }));
      } else {
        console.warn(`Invalid override: ${JSON.stringify({ name, host })}`);
      }
    });
  }
  return Promise.all(overridePromises);
}

async function loadOverride(option: { name: string; host: string }) {
  const { name, host } = option;
  const instance = getInstance();
  const remote = instance.remotes.get(name);
  if (!remote) {
    return Promise.reject(new Error(`Remote module ${name} not found`));
  }
  remote.status = LOAD_STATUS.LOADING;
  let remoteInfo;
  try {
    remoteInfo = await loadFile(`${host}/manifest.json`);
  } catch (error) {
    return Promise.reject(new Error(`Remote module load error: ${error}`));
  } finally {
    remote.status = LOAD_STATUS.LOADED;
  }
  remote.host = host;
  remote.version = remoteInfo.version;
  remote.shared = remoteInfo.shared;
  remote.status = LOAD_STATUS.LOADED;
  console.log(`【Loaded override】: [${name}] in  ${host}`);
  return remoteInfo;
}

function loadFile(url: string): Promise<any | void> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }
      // 根据文件扩展名判断如何处理响应
      const extension = url.split('.').pop()?.toLowerCase();

      switch (extension) {
        case 'json':
          return response.json();
        case 'txt':
        case 'html':
        case 'css':
        case 'js':
        case 'ts':
        case 'jsx':
        case 'tsx':
          return response.text();
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'svg':
          return response.blob();
        default:
          // 对于未知类型，尝试作为文本处理
          return response.text();
      }
    })
    .catch((error) => {
      console.error(`Error loading file ${url}:`, error);
      throw error;
    });
}

export { overrideRemote, loadOverride };
