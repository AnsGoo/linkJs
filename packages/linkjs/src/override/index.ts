import { getInstance } from '..';
import { __LINKJS_OVERRIDES__ } from '../constant';
import { LOAD_STATUS } from '../event-bus/constant';

const DEFAULT_TIMEOUT = 10000;

interface OverrideEntry {
  name: string;
  host: string;
}

/**
 * 校验 host 是否为合法的 http(s) URL。防止 localStorage 注入任意协议/相对路径。
 */
function isValidRemoteHost(host: unknown): host is string {
  if (typeof host !== 'string' || host.length === 0) {
    return false;
  }
  try {
    const url = new URL(host);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 读取并应用 localStorage 中的远程覆盖配置。
 *
 * 配置格式：`{ [remoteName]: 'https://host' }`。
 * 非法的 host 会被跳过并告警；单个 host 加载失败不会影响其它 host。
 */
function overrideRemote() {
  const overridesContent = localStorage.getItem(__LINKJS_OVERRIDES__);
  if (!overridesContent) {
    return Promise.resolve([]);
  }

  let content: Record<string, unknown>;
  try {
    content = JSON.parse(overridesContent);
  } catch (error) {
    console.error('[linkjs] Error parsing overrides:', error);
    return Promise.resolve([]);
  }

  const entries: OverrideEntry[] = [];
  Object.keys(content || {}).forEach((name) => {
    const host = content[name];
    if (!name) {
      return;
    }
    if (isValidRemoteHost(host)) {
      entries.push({ name, host });
    } else {
      console.warn(`[linkjs] Invalid override for "${name}": ${JSON.stringify(host)}`);
    }
  });

  return Promise.all(
    entries.map((entry) => loadOverride(entry).catch((error) => {
      console.warn(`[linkjs] Failed to apply override for "${entry.name}":`, error);
      return null;
    })),
  );
}

async function loadOverride(option: OverrideEntry) {
  const { name, host } = option;
  const instance = getInstance();
  const remote = instance.remotes.get(name);
  if (!remote) {
    throw new Error(`Remote module ${name} not found`);
  }

  remote.status = LOAD_STATUS.LOADING;
  let remoteInfo: any;
  try {
    remoteInfo = await loadFile(`${host}/manifest.json`);
  } finally {
    remote.status = LOAD_STATUS.LOADED;
  }

  if (!remoteInfo || typeof remoteInfo !== 'object') {
    throw new Error(`Invalid manifest from ${host}`);
  }

  remote.host = host;
  remote.version = remoteInfo.version;
  remote.shared = remoteInfo.shared;
  if (remoteInfo.entry) {
    remote.entry = remoteInfo.entry;
  }
  remote.status = LOAD_STATUS.LOADED;
  console.log(`[linkjs] Loaded override: [${name}] in ${host}`);
  return remoteInfo;
}

function loadFile(url: string, timeout = DEFAULT_TIMEOUT): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(url, { signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }
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
          return response.text();
      }
    })
    .catch((error) => {
      console.error(`[linkjs] Error loading file ${url}:`, error);
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

export { overrideRemote, loadOverride };
