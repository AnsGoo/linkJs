import { getRemoteInfo } from '../loader';
import { getInjectedRemoteHost } from '../loader/utils';
import { selectRemoteSource } from '../loader/source';
import { LOAD_STATUS } from '../event-bus/constant';
import { runHook } from '../plugins';
import type { RemoteSource } from '../state/instance';

/** 资源清单（与 unplugin 生成的 manifest `assets` 对齐）。 */
export interface ManifestAsset {
  js?: {
    sync?: string[];
    async?: string[];
  };
  css?: {
    sync?: string[];
    async?: string[];
  };
}

/** 远程 manifest.json 的结构（宽松类型，兼容自定义字段）。 */
export interface RemoteManifest {
  name?: string;
  version?: string;
  entry?: {
    js?: string;
    css?: string;
    html?: string;
    shared?: string;
    types?: string;
    assets?: ManifestAsset;
  };
  exposes?: Array<{ name: string; path: string; assets?: ManifestAsset }>;
  /** 该远程参与的共享作用域（多作用域声明）。 */
  shareScope?: string[];
  /** 远程资源的静态 CDN 基址（供宿主解析资源位置）。 */
  publicPath?: string;
  /** 多源候选列表（健康检查 / 灰度）。 */
  sources?: RemoteSource[];
  shared?: Record<string, unknown>;
  /** 产物 SRI 完整性（manifest path -> `sha384-...`）。 */
  integrity?: Record<string, string>;
  [key: string]: unknown;
}

export interface PreloadRemoteOptions {
  /** 已注册的远程名（用于解析 host 与资源归属；用作快照/去重键）。 */
  name?: string;
  /** 显式 host（覆盖注册表）。 */
  host?: string;
  /** 显式 manifest 地址（优先级最高）。 */
  manifestUrl?: string;
  /** 是否连同 exposes 的异步资源一起预取（默认 false，只预加载 entry 的同步资源）。 */
  prefetch?: boolean;
  /** 强制重新拉取 manifest 与预取资源，忽略已加载/已预取快照。 */
  force?: boolean;
}

/** 一次预取记录（供 `remoteSnapshot`/`globalSnapshot` 查询，避免重复请求）。 */
export interface PrefetchRecord {
  /** 去重键（有 name 用 name，否则用 manifestUrl）。 */
  key: string;
  /** 已注册的远程名（无则为匿名预取）。 */
  name?: string;
  manifestUrl: string;
  manifest: RemoteManifest;
  /** 已预取的资源 href。 */
  assets: string[];
  time: number;
}

const prefetchCache = new Map<string, PrefetchRecord>();
let prefetchVersion = 0;

function prefetchKey(options: PreloadRemoteOptions, url: string): string {
  return options.name ?? url;
}

/** 查询一次预取记录（按 name 或 manifestUrl）。 */
function getPrefetch(key: string): PrefetchRecord | undefined {
  return prefetchCache.get(key);
}

/** 全部预取记录（供 `globalSnapshot` 汇总）。 */
function getPrefetchRecords(): PrefetchRecord[] {
  return [...prefetchCache.values()];
}

/** 预取快照版本号：每次记录/清空自增，用于消费方判断是否需要刷新。 */
function getPrefetchVersion(): number {
  return prefetchVersion;
}

/** 记录一次预取（写入快照缓存并递增版本）。 */
function recordPrefetch(record: PrefetchRecord): void {
  prefetchCache.set(record.key, record);
  prefetchVersion += 1;
}

/** 清空预取快照缓存（测试/手动失效用）。 */
function clearPrefetchCache(): void {
  prefetchCache.clear();
  prefetchVersion += 1;
}

async function resolveManifestUrl(options: PreloadRemoteOptions): Promise<string> {
  if (options.manifestUrl) {
    return options.manifestUrl;
  }
  const info = options.name ? getRemoteInfo(options.name) : undefined;
  let host = options.host;
  if (!host && info && options.name && info.sources?.length) {
    // 多源：先按健康检查 / 灰度选出源，再取其基址。
    const source = await selectRemoteSource(info, options.name);
    host = source?.publicPath || source?.host;
  }
  host = host || info?.host || (options.name ? getInjectedRemoteHost(options.name) : undefined);
  if (!host) {
    throw new Error('[linkjs] preloadRemote requires `manifestUrl`, `host`, or a registered remote `name`');
  }
  return new URL('manifest.json', host.endsWith('/') ? host : `${host}/`).href;
}

/** 是否需要跨域属性（用于让预加载与实际请求复用同一次网络请求）。 */
function crossOriginFor(href: string): string | undefined {
  try {
    return new URL(href, location.href).origin === location.origin ? undefined : 'anonymous';
  } catch {
    return undefined;
  }
}

function addPreloadLink(rel: string, href: string, remoteName?: string, as?: string, integrity?: string): void {
  if (document.querySelector(`link[href="${href}"]`)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (as) {
    link.as = as;
  }
  if (integrity) {
    link.integrity = integrity;
  }
  const crossOrigin = crossOriginFor(href);
  if (crossOrigin) {
    link.crossOrigin = crossOrigin;
  }
  if (remoteName) {
    link.dataset.linkjsRemote = remoteName;
  }
  document.head.appendChild(link);
}

/**
 * 预加载某个远程的资源：拉取其 `manifest.json`，按 `entry.assets`（可选 `exposes`）
 * 用 `<link rel="modulepreload|preload|prefetch">` 预热 JS/CSS，从而在真正 `loadApp`/`loadLib`
 * 之前完成网络与解析准备。
 *
 * 返回解析到的 manifest，便于调用方进一步处理。
 *
 * 预取前会查询快照：已预取（同名/同 manifestUrl）或远程已加载时直接复用，避免重复请求；
 * 传 `force: true` 可强制刷新。
 */
async function preloadRemote(options: PreloadRemoteOptions): Promise<RemoteManifest> {
  await runHook('beforePreloadRemote', options);

  const url = await resolveManifestUrl(options);
  const key = prefetchKey(options, url);

  if (!options.force) {
    const cached = getPrefetch(key);
    if (cached) {
      return cached.manifest;
    }
    if (options.name) {
      const info = getRemoteInfo(options.name);
      if (info?.status === LOAD_STATUS.LOADED) {
        // 已加载：无需再预取，返回最小 manifest 保持契约。
        return { name: info.displayName || options.name };
      }
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[linkjs] preloadRemote: failed to fetch manifest ${url} (${response.status})`);
  }
  const manifest = (await response.json()) as RemoteManifest;

  // 记录 manifest 里的包名（展示名）与共享作用域声明。
  if (options.name) {
    const info = getRemoteInfo(options.name);
    if (info) {
      if (typeof manifest.name === 'string' && manifest.name) {
        info.displayName = manifest.name;
      }
      if (Array.isArray(manifest.shareScope) && manifest.shareScope.length) {
        info.shareScope = manifest.shareScope;
      }
      if (typeof manifest.publicPath === 'string' && manifest.publicPath) {
        info.publicPath = manifest.publicPath;
      }
      if (Array.isArray(manifest.sources) && manifest.sources.length) {
        info.sources = manifest.sources;
      }
    }
  }

  const sync = new Set<string>();
  const async = new Set<string>();
  const collect = (asset: ManifestAsset | undefined, includeAsync: boolean) => {
    asset?.js?.sync?.forEach((h) => sync.add(h));
    asset?.css?.sync?.forEach((h) => sync.add(h));
    if (includeAsync) {
      asset?.js?.async?.forEach((h) => async.add(h));
      asset?.css?.async?.forEach((h) => async.add(h));
    }
  };

  collect(manifest.entry?.assets, options.prefetch ?? false);
  if (options.prefetch) {
    for (const expose of manifest.exposes ?? []) {
      collect(expose.assets, true);
    }
  }

  const resolved = (href: string) => new URL(href, url).href;
  for (const href of sync) {
    const abs = resolved(href);
    addPreloadLink(
      abs.endsWith('.css') ? 'preload' : 'modulepreload',
      abs,
      options.name,
      abs.endsWith('.css') ? 'style' : undefined,
      manifest.integrity?.[href],
    );
  }
  for (const href of async) {
    addPreloadLink('prefetch', resolved(href), options.name, undefined, manifest.integrity?.[href]);
  }

  const assets = [...sync, ...async].map(resolved);
  recordPrefetch({ key, name: options.name, manifestUrl: url, manifest, assets, time: Date.now() });
  await runHook('afterPreloadRemote', manifest, assets);
  return manifest;
}

export {
  preloadRemote,
  getPrefetch,
  getPrefetchRecords,
  getPrefetchVersion,
  recordPrefetch,
  clearPrefetchCache,
};
