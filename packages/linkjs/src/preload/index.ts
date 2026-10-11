import { getRemoteInfo } from '../loader';
import { runHook } from '../plugins';

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
  shared?: Record<string, unknown>;
  /** 产物 SRI 完整性（manifest path -> `sha384-...`）。 */
  integrity?: Record<string, string>;
  [key: string]: unknown;
}

export interface PreloadRemoteOptions {
  /** 已注册的远程名（用于解析 host 与资源归属）。 */
  name?: string;
  /** 显式 host（覆盖注册表）。 */
  host?: string;
  /** 显式 manifest 地址（优先级最高）。 */
  manifestUrl?: string;
  /** 是否连同 exposes 的异步资源一起预取（默认 false，只预加载 entry 的同步资源）。 */
  prefetch?: boolean;
}

function resolveManifestUrl(options: PreloadRemoteOptions): string {
  if (options.manifestUrl) {
    return options.manifestUrl;
  }
  const info = options.name ? (getRemoteInfo(options.name) as { host?: string } | undefined) : undefined;
  const host = options.host || info?.host;
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
 */
async function preloadRemote(options: PreloadRemoteOptions): Promise<RemoteManifest> {
  await runHook('beforePreloadRemote', options);

  const url = resolveManifestUrl(options);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[linkjs] preloadRemote: failed to fetch manifest ${url} (${response.status})`);
  }
  const manifest = (await response.json()) as RemoteManifest;

  // 记录 manifest 里的包名作为展示名。
  if (options.name && typeof manifest.name === 'string' && manifest.name) {
    const info = getRemoteInfo(options.name) as { displayName?: string } | undefined;
    if (info) {
      info.displayName = manifest.name;
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

  await runHook('afterPreloadRemote', manifest, [...sync, ...async].map(resolved));
  return manifest;
}

export { preloadRemote };
