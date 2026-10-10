import { getInstance } from '..';
import { loadShare } from '../share';

// 本地 runtime 按名称缓存，保证同一应用内框架生态解析到同一份实例。
const localCache = new Map<string, Promise<any>>();

/**
 * 自适应加载框架级 runtime（路线 B）。
 *
 * - 宿主为 DEV：复用共享 dev runtime（单实例，原生 HMR 可用）；
 * - 宿主为 PROD（或独立运行）：回退到本应用的 `localLoader`（自带 dev runtime）。
 *
 * 关键在于：无论哪种模式，子应用 dev 时都能拿到一份**带 HMR 的** runtime。
 */
async function loadRuntime(name: string, localLoader: () => Promise<any>): Promise<any> {
  const instance = getInstance() as { mode?: 'development' | 'production' };
  const mode = instance.mode || 'production';

  if (mode !== 'production') {
    const shared = await loadShare(name);
    if (shared) {
      return shared;
    }
  }

  let pending = localCache.get(name);
  if (!pending) {
    pending = Promise.resolve(localLoader());
    localCache.set(name, pending);
  }
  return pending;
}

function resetRuntimeCache(): void {
  localCache.clear();
}

export { loadRuntime, resetRuntimeCache };
