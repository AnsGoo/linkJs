/**
 * 有向图算法：环检测与强连通分量（SCC）。
 *
 * 构建期（`unplugin-linkjs`）与运行时（`linkjs` 的 loader）**共用本模块**，避免两套独立实现
 * 各修各的而漂移。全部为纯函数、迭代实现（深图不爆栈），可安全在 Node（构建期）与浏览器运行。
 */

/** 有向图是否存在环（迭代式 DFS，深图安全）。 */
export function hasDependencyCycle(graph: Record<string, string[]>): boolean {
  const visited = new Set<string>();
  const onStack = new Set<string>();
  for (const start of Object.keys(graph)) {
    if (visited.has(start)) {
      continue;
    }
    const stack: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];
    visited.add(start);
    onStack.add(start);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = graph[frame.node] ?? [];
      if (frame.next >= children.length) {
        onStack.delete(frame.node);
        stack.pop();
        continue;
      }
      const child = children[frame.next++];
      if (onStack.has(child)) {
        return true;
      }
      if (!visited.has(child)) {
        visited.add(child);
        onStack.add(child);
        stack.push({ node: child, next: 0 });
      }
    }
  }
  return false;
}

/**
 * 求有向图的强连通分量（Kosaraju，迭代实现，深图安全）。
 * 返回所有 SCC（含单点分量）。
 */
export function findStronglyConnectedComponents(graph: Record<string, string[]>): string[][] {
  const nodes = new Set<string>();
  for (const [key, values] of Object.entries(graph)) {
    nodes.add(key);
    values.forEach((v) => nodes.add(v));
  }
  const adj = new Map<string, string[]>();
  const radj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n, graph[n] ?? []);
    radj.set(n, []);
  }
  for (const [key, values] of Object.entries(graph)) {
    for (const v of values) {
      radj.get(v)?.push(key);
    }
  }

  // 第一遍 DFS：按完成时间入栈
  const visited = new Set<string>();
  const order: string[] = [];
  for (const start of nodes) {
    if (visited.has(start)) {
      continue;
    }
    visited.add(start);
    const stack: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = adj.get(frame.node) ?? [];
      if (frame.next < children.length) {
        const child = children[frame.next++];
        if (!visited.has(child)) {
          visited.add(child);
          stack.push({ node: child, next: 0 });
        }
      } else {
        order.push(frame.node);
        stack.pop();
      }
    }
  }

  // 第二遍 DFS：在反向图上按逆完成序收敛分量
  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const start = order[i];
    if (assigned.has(start)) {
      continue;
    }
    const comp: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      comp.push(node);
      for (const prev of radj.get(node) ?? []) {
        if (!assigned.has(prev)) {
          assigned.add(prev);
          stack.push(prev);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

/** 仅返回**有环**的强连通分量（size>1 或自环），即“需并载”的集合。 */
export function findCyclicComponents(graph: Record<string, string[]>): string[][] {
  return findStronglyConnectedComponents(graph).filter(
    (comp) => comp.length > 1 || (comp.length === 1 && (graph[comp[0]] ?? []).includes(comp[0])),
  );
}

/**
 * 在有向图中检测环（迭代式 DFS），返回所有**发现**的环路径。
 * 每个环形如 `['A', 'B', 'A']`（首尾同节点）。
 *
 * 注意：受单次 DFS 的全局 `visited` 限制，本函数**不保证穷举**所有环路径；
 * 需要「必须并载」的完整成员集合时请用 `findCyclicComponents`。
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
