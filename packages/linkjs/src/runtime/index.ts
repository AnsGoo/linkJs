import { getInstance } from '..';
import { loadShare } from '../share';

interface RuntimeCarrier {
  /** 全局共享的 dev runtime（跨子应用可见，保证全页只有一份） */
  runtimeModules?: Map<string, any>;
  /** 并发加载去重 */
  runtimePending?: Map<string, Promise<any>>;
}

/**
 * 自适应加载框架级 runtime（路线 B）。
 *
 * - 宿主为 DEV：复用共享 dev runtime（单实例，原生 HMR 可用）；
 * - 宿主为 PROD（或独立运行）：加载本应用自带 dev runtime，并**登记到全局实例**，
 *   使同页其它 dev 子应用复用它 → 全页仅一份 dev runtime，避免多份
 *   `__VUE_HMR_RUNTIME__` 全局互相覆盖导致 HMR 静默失效。
 *
 * 关键在于：无论哪种模式，子应用 dev 时都能拿到一份**带 HMR 的** runtime，
 * 且整页共享同一份。
 */
async function loadRuntime(name: string, localLoader: () => Promise<any>): Promise<any> {
  const instance = getInstance() as RuntimeCarrier & { mode?: 'development' | 'production' };
  const mode = instance.mode || 'production';

  if (mode !== 'production') {
    const shared = await loadShare(name);
    if (shared) {
      return shared;
    }
  }

  if (!instance.runtimeModules) {
    instance.runtimeModules = new Map();
  }
  if (!instance.runtimePending) {
    instance.runtimePending = new Map();
  }

  const cached = instance.runtimeModules.get(name);
  if (cached) {
    return cached;
  }
  const pending = instance.runtimePending.get(name);
  if (pending) {
    return pending;
  }

  const promise = Promise.resolve(localLoader())
    .then((mod) => {
      instance.runtimeModules!.set(name, mod);
      return mod;
    })
    .finally(() => {
      instance.runtimePending!.delete(name);
    });

  instance.runtimePending.set(name, promise);
  return promise;
}

/** 清空共享 dev runtime 缓存（测试/卸载用）。 */
function resetRuntimeCache(): void {
  const instance = getInstance() as RuntimeCarrier;
  instance.runtimeModules?.clear();
  instance.runtimePending?.clear();
}

export { loadRuntime, resetRuntimeCache };
