/**
 * Snapshot 沙箱。
 *
 * 背景：子应用以原生 ESM 同页加载，ESM 代码无法用 `with(proxy)` 包裹，
 * 因此无法做到运行时级别的全局隔离（那需要 iframe/worker 的独立 realm）。
 *
 * 本实现提供「快照式」沙箱：在子应用加载前记录 globalThis 的自身属性，
 * 卸载时删除子应用新增的全局、并还原被其修改的全局，从而避免全局污染长期残留。
 *
 * 局限（需知悉）：子应用运行期间仍能读写宿主的全局对象；这是同页 ESM 架构的固有限制。
 */

const PROTECTED_KEYS = new Set([
  // linkjs 自身的单例与调试入口，不能回滚
  '$linkjs',
  '__linkjs_instance__',
  '__linkjs_overrides__',
]);

export interface SandboxSnapshot {
  keys: Set<string>;
  values: Map<string, unknown>;
}

export function captureSnapshot(): SandboxSnapshot {
  const keys = new Set<string>();
  const values = new Map<string, unknown>();
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    keys.add(key);
    values.set(key, (globalThis as any)[key]);
  }
  return { keys, values };
}

const snapshots = new Map<string, SandboxSnapshot>();

/** 激活某个子应用的快照沙箱（幂等）。 */
export function activateSandbox(name: string): void {
  if (!snapshots.has(name)) {
    snapshots.set(name, captureSnapshot());
  }
}

/** 关闭并回滚某个子应用的沙箱；返回是否命中。 */
export function deactivateSandbox(name: string): boolean {
  const snapshot = snapshots.get(name);
  if (!snapshot) {
    return false;
  }
  restoreSnapshot(snapshot);
  snapshots.delete(name);
  return true;
}

/** 关闭所有沙箱并回滚。 */
export function deactivateAllSandboxes(): void {
  snapshots.forEach((snapshot) => restoreSnapshot(snapshot));
  snapshots.clear();
}

export function restoreSnapshot(snapshot: SandboxSnapshot): void {
  // 删除快照之后新增的全局
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (PROTECTED_KEYS.has(key) || snapshot.keys.has(key)) {
      continue;
    }
    try {
      delete (globalThis as any)[key];
    } catch {
      // 不可删除的属性（内置/只读）忽略
    }
  }

  // 还原被修改的全局
  snapshot.keys.forEach((key) => {
    if (PROTECTED_KEYS.has(key)) {
      return;
    }
    const oldValue = snapshot.values.get(key);
    if ((globalThis as any)[key] !== oldValue) {
      try {
        (globalThis as any)[key] = oldValue;
      } catch {
        // 只读属性忽略
      }
    }
  });
}
