/**
 * 远程间依赖（remote → remote）的运行时解析。
 *
 * 在加载某远程**之前**，按声明的 `remotes` 拓扑地加载其依赖：
 * - 拓扑序：先递归加载依赖，再加载本远程；
 * - 去重：同名并发只加载一次（`remoteInflight`）；
 * - 环：构建期应已拦截（见 docs/remote-dependencies.md §15），运行期仅防御性跳过；
 * - 版本：仅当依赖**显式声明 version** 时才校验（默认 first-loaded，不校验）；
 * - 引用计数：每加载一个被依赖远程 +1，供卸载时避免误删。
 * 加载动作由调用方注入（`loadOne`），便于测试与复用 app/lib 两套加载器。
 */

import { getInstance } from '..';
import { LOAD_STATUS } from '../event-bus/constant';
import { recordDiagnostic } from '../devtools';
import { VersionComparator } from '../share/version-comparator';
import type { RemoteDependency } from '../state/instance';
import { getRemoteInfo } from './utils';

export interface ResolveDepsContext {
  /** 当前解析栈（环检测）。 */
  stack: string[];
  /** 并发去重表（name -> Promise），跨层共享。 */
  inflight: Map<string, Promise<unknown>>;
  /** 实际加载某个远程（按 type 选 loadApp/loadLib；不再递归解析其依赖）。 */
  loadOne: (name: string, dep: RemoteDependency) => Promise<unknown>;
}

function isLoaded(name: string): boolean {
  return getInstance().remotes.get(name)?.status === LOAD_STATUS.LOADED;
}

/** 依赖未在注册表中时兜底注册（host 可经 `__linkjs_remote_hosts__` 解析）。 */
function ensureRegistered(name: string, dep: RemoteDependency): void {
  const instance = getInstance();
  if (instance.remotes.has(name)) {
    return;
  }
  instance.remotes.set(name, {
    name,
    entry: '',
    ...(dep.host ? { host: dep.host } : {}),
    status: LOAD_STATUS.UNLOADED,
  });
}

function verifyVersion(name: string, range: string | undefined): void {
  if (!range) {
    return;
  }
  const resolved = getInstance().remotes.get(name)?.version;
  if (!resolved) {
    return;
  }
  if (!VersionComparator.satisfiesVersion(resolved, range)) {
    recordDiagnostic({
      level: 'warn',
      code: 'REMOTE_DEP_VERSION_MISMATCH',
      message: `remote dep "${name}" resolved ${resolved} does not satisfy ${range}`,
    });
  }
}

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

/** expose 引用计数 +1（key 形如 `<appName>/<Expose>`）。 */
export function retainExpose(key: string): void {
  const instance = getInstance();
  const refs = (instance.exposeRefs ??= new Map());
  refs.set(key, (refs.get(key) ?? 0) + 1);
}

/** expose 引用计数 -1，返回剩余计数。 */
export function releaseExpose(key: string): number {
  const instance = getInstance();
  const refs = (instance.exposeRefs ??= new Map());
  const next = (refs.get(key) ?? 0) - 1;
  refs.set(key, next);
  return next;
}

/** 引用计数 +1。 */
export function retainRemote(name: string): void {
  const instance = getInstance();
  const refs = (instance.remoteRefs ??= new Map());
  refs.set(name, (refs.get(name) ?? 0) + 1);
}

/** 引用计数 -1，返回剩余计数。 */
export function releaseRemote(name: string): number {
  const instance = getInstance();
  const refs = (instance.remoteRefs ??= new Map());
  const next = (refs.get(name) ?? 0) - 1;
  refs.set(name, next);
  return next;
}

/**
 * 拓扑解析并加载 `name` 的全部远程依赖（依赖先于自身）。
 * `ctx.stack` 用于环检测，`ctx.inflight` 用于并发去重。
 */
export async function resolveRemoteDeps(
  name: string,
  deps: Record<string, RemoteDependency>,
  ctx: ResolveDepsContext,
): Promise<void> {
  for (const [depName, dep] of Object.entries(deps)) {
    if (ctx.stack.includes(depName)) {
      recordDiagnostic({
        level: 'warn',
        code: 'REMOTE_DEP_CYCLE',
        message: `remote dependency cycle: ${[...ctx.stack, depName].join(' -> ')}`,
      });
      continue;
    }

    if (isLoaded(depName)) {
      verifyVersion(depName, dep.version);
      continue;
    }

    const pending = ctx.inflight.get(depName);
    if (pending) {
      await pending;
      verifyVersion(depName, dep.version);
      continue;
    }

    const task = (async () => {
      ensureRegistered(depName, dep);
      await resolveRemoteDeps(depName, getRemoteInfo(depName)?.remotes ?? {}, {
        ...ctx,
        stack: [...ctx.stack, name],
      });
      retainRemote(depName);
      await ctx.loadOne(depName, dep);
      verifyVersion(depName, dep.version);
    })().catch((error) => {
      if (dep.required === false) {
        recordDiagnostic({
          level: 'warn',
          code: 'REMOTE_DEP_ERROR',
          message: `optional remote dep "${depName}" (required by "${name}") failed: ${String(error)}`,
        });
        return;
      }
      recordDiagnostic({
        level: 'error',
        code: 'REMOTE_DEP_ERROR',
        message: `remote dep "${depName}" (required by "${name}") failed: ${String(error)}`,
      });
      throw error;
    });

    ctx.inflight.set(depName, task);
    await task;
  }
}
