import { getInstance } from '..';
import { __LINKJS_REMOTE_HOSTS__ } from '../constant';
import { LIB_EXPOSE } from '../event-bus/constant';
import { getShadowRoot } from '../sandbox/shadow';
import type { RegistryOption, RemoteEntry, RemoteInfo, RemoteSource } from '../state/instance';
import type { RemoteModule } from '../types';
import { selectRemoteSource } from './source';

/** 已加载远程模块的运行时缓存（`appName -> 暴露对象`）。 */
type RemoteCache = Map<string, RemoteModule>;

/** 归一化远程入口配置：字符串入口同时视作 app 的 html 与 lib 的 js。 */
function resolveEntryConfig(entry: string | RemoteEntry | undefined): RemoteEntry {
  if (!entry) {
    return {};
  }
  return typeof entry === 'string' ? { html: entry, js: entry } : entry;
}

/**
 * 解析远程参与的共享作用域。
 *
 * 优先级：显式 `shareScope`（注册表 / manifest 声明）> 由 `shared` 各项的 `scope`
 * 推导 > `[undefined]`（交由 `loadShare` 使用默认作用域）。
 */
function resolveShareScopes(remoteInfo: RegistryOption): (string | undefined)[] {
  if (remoteInfo.shareScope?.length) {
    return remoteInfo.shareScope;
  }
  const scopes = new Set<string>();
  for (const dep of Object.values(remoteInfo.shared ?? {})) {
    if (dep.scope) {
      scopes.add(dep.scope);
    }
  }
  return scopes.size ? [...scopes] : [undefined];
}

/** 动态解析远程资源基址（CDN）的上下文。 */
export interface PublicPathContext {
  /** 远程应用 / 库名。 */
  appName: string;
  /** 已录入的远程信息（注册表 / override / manifest）。 */
  remoteInfo: RegistryOption;
  /** 调用方显式传入的 host（优先级最高）。 */
  host?: string;
  /** 缺省基址（当前页面 origin）。 */
  defaultPublicPath: string;
}

/** 动态基址解析器：返回远程资源基址（可异步，支持 CDN / 运行时自解析）。 */
export type PublicPathResolver = (ctx: PublicPathContext) => string | Promise<string>;

/** 是否为绝对 URL（含协议或协议相对）。 */
function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//');
}

/** 读取构建期注入的远程基址映射（`unplugin-linkjs` 依据 `consumeTypes.remotes` 写入）。 */
function getInjectedRemoteHost(appName: string): string | undefined {
  const store = (globalThis as Record<string, unknown>)[__LINKJS_REMOTE_HOSTS__];
  if (!store || typeof store !== 'object') {
    return undefined;
  }
  const host = (store as Record<string, unknown>)[appName];
  return typeof host === 'string' && host ? host : undefined;
}

/** 把相对基址解析为绝对 URL；绝对基址原样返回（不改动尾斜杠语义）。 */
function toAbsoluteBase(value: string): string {
  if (isAbsoluteUrl(value) || typeof location === 'undefined') {
    return value;
  }
  return new URL(value, location.href).href;
}

/**
 * 解析远程资源基址（**CDN 动态基址自解析**）。
 *
 * 优先级：调用方 `host` > 远程级 `getPublicPath` > 远程级静态 `publicPath` >
 * 实例级 `getPublicPath`（全局 CDN 策略）> 注册的 `host` > 当前页面 origin。
 *
 * 返回值为可直接用于 `new URL(entry, base)` 的基址；相对值会按当前页面解析。
 */
async function resolvePublicPath(remoteInfo: RegistryOption, appName: string, explicitHost?: string): Promise<string> {
  if (explicitHost) {
    return toAbsoluteBase(explicitHost);
  }

  const defaultPublicPath = typeof location !== 'undefined' ? `${location.protocol}//${location.host}` : '';
  const ctx: PublicPathContext = { appName, remoteInfo, host: explicitHost, defaultPublicPath };

  let resolved: string | undefined;
  let selectedSource: RemoteSource | undefined;

  if (remoteInfo.getPublicPath) {
    resolved = await remoteInfo.getPublicPath(ctx);
  }
  if (!resolved && remoteInfo.publicPath) {
    resolved = remoteInfo.publicPath;
  }
  // 多源列表：先做健康检查 / 灰度选择，再取该源的 CDN 基址。
  if (!resolved && remoteInfo.sources?.length) {
    selectedSource = await selectRemoteSource(remoteInfo, appName);
    if (selectedSource?.publicPath) {
      resolved = selectedSource.publicPath;
    }
  }
  if (!resolved) {
    const instanceResolver = getInstance().getPublicPath;
    if (instanceResolver) {
      resolved = await instanceResolver(ctx);
    }
  }
  // 回退顺序：注册信息里的 host > 构建期注入的 host（consumeTypes.remotes）> 当前页面 origin。
  resolved = resolved || selectedSource?.host || remoteInfo.host || getInjectedRemoteHost(appName) || defaultPublicPath;
  return toAbsoluteBase(resolved);
}

/** 请求 URL 重写器（插件通过 `instance.requestRewriters` 注册）。 */
export type RequestRewriter = (url: string, ctx: { remoteName?: string }) => string | void;

/** 允许插件改写远程资源的请求 URL（鉴权 token、CDN 网关、路径映射等）。 */
function rewriteRequestUrl(url: string, remoteName?: string): string {
  const rewriters = getInstance().requestRewriters;
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

function getRemoteInfo(name: string): RemoteInfo | undefined {
  const instance = getInstance();
  return instance.remotes.get(name);
}

function useGetRemote<M = unknown>(remoteCache: RemoteCache) {
  return (entry: string) => getRemoteFromCache<M>(entry, remoteCache);
}

function getRemoteFromCache<M = unknown>(entry: string, remoteCache: RemoteCache): M | null {
  const [appName, modelName] = entry.split('/');
  if (!remoteCache.has(appName)) {
    return null;
  }
  console.log(`Remote module ${appName} already loaded, returning from cache`);
  const appModule = remoteCache.get(appName);
  if (!appModule) {
    console.warn(`Remote module ${appName} not found in cache, please load it first: loadRemote('${appName}')`);
    return null;
  }
  const selected = modelName ? appModule[modelName] : (appModule['default'] ?? appModule);
  return (selected as M) || null;
}

export interface ExtOption {
  timeoutId?: ReturnType<typeof setTimeout>;
  modelName?: string;
}

/**
 * 在加载某个远程期间把「共享注册来源」标记为 `provider`，
 * 使该远程 bundle 内触发的 `registerShare` 记录正确的来源实体（否则默认视为宿主）。
 */
function withShareProvider<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { __LINKJS_SHARE_PROVIDER__?: string };
  const prev = g.__LINKJS_SHARE_PROVIDER__;
  g.__LINKJS_SHARE_PROVIDER__ = provider;
  return fn().finally(() => {
    if (prev === undefined) {
      delete g.__LINKJS_SHARE_PROVIDER__;
    } else {
      g.__LINKJS_SHARE_PROVIDER__ = prev;
    }
  });
}

function useHandleExpose<M = unknown>(
  remoteCache: RemoteCache,
  resolve: (value: M | null) => void,
  appName: string,
  options: ExtOption,
) {
  const handler = (data: { libName: string; lib: RemoteModule }) => {
    if (data.libName !== appName || !data.lib) {
      return;
    }
    const linkInstance = getInstance();
    linkInstance.eventBus.off(LIB_EXPOSE, handler);
    const { modelName } = options;
    if (options.timeoutId) {
      clearTimeout(options.timeoutId);
    }
    remoteCache.set(appName, data.lib);
    console.log(`Remote module ${appName} cached`);
    if (modelName) {
      return resolve((data.lib[modelName] as M) || null);
    }
    return resolve((data.lib['default'] as M) || (data.lib as unknown as M) || null);
  };
  return handler;
}

export { loadCss, preloadModule, loadScript, rewriteRequestUrl, getRemoteInfo, getInjectedRemoteHost, resolveEntryConfig, resolveShareScopes, resolvePublicPath, useGetRemote, useHandleExpose, withShareProvider };
export type { LoadScriptOptions, ResourceSecurityOptions, RemoteCache };
