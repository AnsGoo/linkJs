import type { RemoteTypeTarget } from './types.js';

/** 构建期注入的运行时常量名（与 linkjs 的 constant 保持一致）。 */
export const REMOTE_HOSTS_GLOBAL = '__linkjs_remote_hosts__';
export const PRELOAD_GLOBAL = '__linkjs_preload__';

export interface RuntimeBootstrap {
  /** 远程名 -> 运行时基址（linkjs 省略 host 时回退使用）。 */
  hosts: Record<string, string>;
  /** 启动即预加载的 preloadRemote 参数列表。 */
  preloads: Record<string, unknown>[];
}

/**
 * 允许 `import { X } from '<remote>'` 语法的远程名。
 * 只有声明了 `preload` 的 remote 才支持；lazy 的只能用运行时 `loadRemote`/`loadLib`。
 */
export function selectRemoteImportNames(remotes: RemoteTypeTarget[] = []): string[] {
  return remotes.filter((target) => target.preload).map((target) => target.name);
}

function originOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * 由 `consumeTypes.remotes` 推导运行时引导数据：
 * - `hosts`：始终为每个带 host / manifestUrl 的远程生成；
 * - `preloads`：仅对声明了 `preload` 的远程生成，缺省沿用该目标的 `manifestUrl` / `host`，
 *   可用 `preload.manifestUrl` / `preload.host` / `preload.prefetch` 覆盖。
 */
export function buildRuntimeBootstrap(remotes: RemoteTypeTarget[] = []): RuntimeBootstrap {
  const hosts: Record<string, string> = {};
  const preloads: Record<string, unknown>[] = [];

  for (const target of remotes) {
    const host = target.host ?? originOf(target.manifestUrl);
    if (host) {
      hosts[target.name] = host;
    }

    const preload = target.preload;
    if (!preload) {
      continue;
    }
    const extra = typeof preload === 'object' ? preload : {};
    const manifestUrl = extra.manifestUrl ?? target.manifestUrl;
    const entry: Record<string, unknown> = { name: target.name };
    if (manifestUrl) {
      entry.manifestUrl = manifestUrl;
    }
    const resolvedHost = extra.host ?? target.host ?? originOf(manifestUrl);
    if (resolvedHost) {
      entry.host = resolvedHost;
    }
    if (extra.prefetch !== undefined) {
      entry.prefetch = extra.prefetch;
    }
    preloads.push(entry);
  }

  return { hosts, preloads };
}
