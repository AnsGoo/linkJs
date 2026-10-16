/**
 * 远程依赖图：构建期检测**循环依赖**。
 *
 * 远程间出现环通常意味着契约设计问题（详见 docs/remote-dependencies.md §15），
 * 应在构建期尽早拦截，而不是留到运行时。运行期仅作防御性跳过。
 *
 * 图算法（环判定 / SCC）与运行时**共用** `linkjs/graph`，本模块只负责「拉取 manifest 建图」。
 */

export interface RemoteRoot {
  name: string;
  host?: string;
}
/** 单个远程 manifest 未能解析的原因。 */
export type UnresolvedReason = 'no-host' | 'http-error' | 'fetch-error';
export interface CollectGraphOptions {
  /** fetch 实现（默认全局 fetch）；测试可注入。 */
  fetch?: typeof fetch;
  /** 单次拉取超时（ms），默认 3000。 */
  timeout?: number;
  /** 最大节点数，默认 50。 */
  maxNodes?: number;
  /** 与 consumeTypes 一致的鉴权：拉取 manifest 时附带的查询参数 token。 */
  auth?: { token?: string; queryParam?: string };
  /**
   * 某节点无法解析（无 host / 404 / 超时）时回调。
   * 该节点的下游依赖因此未知、不计入图——调用方应据此告警，避免**静默漏检**。
   */
  onUnresolved?: (info: { name: string; host?: string; reason: UnresolvedReason; status?: number }) => void;
  /** 达到 `maxNodes` 提前停止、仍有待处理节点时回调（图被截断，可能漏检）。 */
  onTruncated?: (info: { processed: number; maxNodes: number; pending: number }) => void;
}

/** 按需给 manifest URL 附加鉴权 token（与 consume-types 的 `withAuth` 语义一致）。 */
function applyAuth(url: string, auth: CollectGraphOptions['auth']): string {
  if (!auth?.token) {
    return url;
  }
  const target = new URL(url);
  target.searchParams.set(auth.queryParam ?? 'token', auth.token);
  return target.href;
}

/** 远程 manifest 中可能承载依赖声明的两处：顶层 `remotes` 与各 expose 的 `deps.remotes`。 */
interface ManifestLike {
  remotes?: Record<string, { host?: string }>;
  exposes?: Array<{ deps?: { remotes?: Record<string, { host?: string }> } }>;
}

/**
 * 合并顶层 `remotes` 与各 expose 的 `deps.remotes`。
 *
 * 运行时 `pickRootDeps` 支持 expose 级远程依赖，构建期若只看顶层 `remotes` 会漏掉这些边
 * （进而漏检经过它们的环）——这里对齐运行时语义。顶层声明的 host 优先。
 */
function extractRemoteDeps(manifest: ManifestLike): Record<string, { host?: string }> {
  const merged: Record<string, { host?: string }> = { ...manifest.remotes };
  for (const expose of manifest.exposes ?? []) {
    for (const [name, cfg] of Object.entries(expose?.deps?.remotes ?? {})) {
      const existing = merged[name];
      if (!existing) {
        merged[name] = { host: cfg?.host };
      } else if (!existing.host && cfg?.host) {
        merged[name] = { host: cfg.host };
      }
    }
  }
  return merged;
}

/**
 * **传递**收集远程依赖图：从 roots 出发 BFS 拉取各 manifest 的 `remotes`。
 * 限节点数 / 单次超时；拉取失败（远端未起）视为叶子（未知边），但会上报 `onUnresolved`。
 */
export async function collectRemoteDependencyGraph(
  roots: RemoteRoot[],
  options: CollectGraphOptions = {},
): Promise<Record<string, string[]>> {
  const fetchImpl = options.fetch ?? fetch;
  const timeout = options.timeout ?? 3000;
  const maxNodes = options.maxNodes ?? 50;
  const graph: Record<string, string[]> = {};
  const queue: RemoteRoot[] = [...roots];
  const seen = new Set<string>();
  let guard = 0;

  while (queue.length > 0 && guard++ < maxNodes) {
    const { name, host } = queue.shift()!;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    graph[name] = graph[name] ?? [];
    if (!host) {
      options.onUnresolved?.({ name, reason: 'no-host' });
      continue;
    }
    try {
      const manifestUrl = new URL('manifest.json', host.endsWith('/') ? host : `${host}/`).href;
      const url = applyAuth(manifestUrl, options.auth);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timer = setTimeout(() => controller?.abort(), timeout);
      const response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
      clearTimeout(timer);
      if (!response.ok) {
        options.onUnresolved?.({ name, host, reason: 'http-error', status: response.status });
        continue;
      }
      const manifest = (await response.json()) as ManifestLike;
      const deps = extractRemoteDeps(manifest);
      graph[name] = Object.keys(deps);
      for (const [depName, depCfg] of Object.entries(deps)) {
        queue.push({ name: depName, host: depCfg?.host ?? new URL(url).origin });
      }
    } catch {
      // 远端未起 / 超时：视为叶子（未知边），但上报以便调用方告警而非静默漏检。
      options.onUnresolved?.({ name, host, reason: 'fetch-error' });
    }
  }
  if (queue.length > 0) {
    options.onTruncated?.({ processed: seen.size, maxNodes, pending: queue.length });
  }
  return graph;
}

// 图算法与运行时共用同一实现（`linkjs` 的 `graph` 子路径导出）。
export { detectRemoteDependencyCycles, findStronglyConnectedComponents, findCyclicComponents } from 'linkjs/graph';
