/**
 * 远程依赖图：构建期检测**循环依赖**。
 *
 * 远程间出现环通常意味着契约设计问题（详见 docs/remote-dependencies.md §15），
 * 应在构建期尽早拦截，而不是留到运行时。运行期仅作防御性跳过。
 */

export interface RemoteRoot {
  name: string;
  host?: string;
}
export interface CollectGraphOptions {
  /** fetch 实现（默认全局 fetch）；测试可注入。 */
  fetch?: typeof fetch;
  /** 单次拉取超时（ms），默认 3000。 */
  timeout?: number;
  /** 最大节点数，默认 50。 */
  maxNodes?: number;
}

/**
 * **传递**收集远程依赖图：从 roots 出发 BFS 拉取各 manifest 的 `remotes`。
 * 限节点数 / 单次超时；拉取失败（远端未起）视为叶子（未知边），不误报。
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
      continue;
    }
    try {
      const url = new URL('manifest.json', host.endsWith('/') ? host : `${host}/`).href;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timer = setTimeout(() => controller?.abort(), timeout);
      const response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const manifest = (await response.json()) as { remotes?: Record<string, { host?: string }> };
      const deps = manifest.remotes ?? {};
      graph[name] = Object.keys(deps);
      for (const [depName, depCfg] of Object.entries(deps)) {
        queue.push({ name: depName, host: depCfg?.host ?? new URL(url).origin });
      }
    } catch {
      /* 远端未起：视为叶子 */
    }
  }
  return graph;
}

/**
 * 在有向图中检测环（迭代式 DFS），返回所有发现的环路径。
 * 每个环形如 `['A', 'B', 'A']`（首尾同节点）。
 *
 * @param graph 邻接表：节点 -> 直接依赖的节点列表
 */
export function detectRemoteDependencyCycles(graph: Record<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  const dfs = (start: string) => {
    // 显式栈，避免深图递归爆栈。
    const frames: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];
    visited.add(start);
    onStack.add(start);
    stack.push(start);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const children = graph[frame.node] ?? [];
      if (frame.next >= children.length) {
        frames.pop();
        onStack.delete(frame.node);
        stack.pop();
        continue;
      }
      const child = children[frame.next++];
      if (onStack.has(child)) {
        const from = stack.indexOf(child);
        cycles.push([...stack.slice(from), child]);
        continue;
      }
      if (visited.has(child)) {
        continue;
      }
      visited.add(child);
      onStack.add(child);
      stack.push(child);
      frames.push({ node: child, next: 0 });
    }
  };

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
  return cycles;
}
