/**
 * 远程依赖图：构建期检测**循环依赖**。
 *
 * 远程间出现环通常意味着契约设计问题（详见 docs/remote-dependencies.md §15），
 * 应在构建期尽早拦截，而不是留到运行时。运行期仅作防御性跳过。
 */

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
