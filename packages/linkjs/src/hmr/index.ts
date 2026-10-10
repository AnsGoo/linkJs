import { linkInstance } from '../state';
import { LIB_EXPOSE, REMOTE_UPDATE } from '../event-bus/constant';

interface HmrSlot {
  appName: string;
  key: string;
  lib: Record<string, any>;
}

interface RemoteUpdatePayload {
  appName: string;
  key?: string;
}

interface VueHmrRuntime {
  createRecord(id: string, comp: any): boolean;
  rerender(id: string, render: Function): void;
  reload(id: string, newComp: any): void;
  CHANGED_FILE?: string;
}

// hmrId -> 暴露槽位（同一 lib 对象即 remoteCache 中缓存的对象）
const hmrIndex = new Map<string, HmrSlot>();

/**
 * 记录暴露对象中带 `__hmrId` 的组件，建立 `hmrId -> 槽位` 映射。
 * 返回本次索引到的 hmrId 列表。
 */
function indexExposedLib(appName: string, lib: any): string[] {
  if (!lib || typeof lib !== 'object') {
    return [];
  }
  const ids: string[] = [];
  for (const key of Object.keys(lib)) {
    const value = (lib as Record<string, any>)[key];
    const hmrId = value && typeof value === 'object' ? (value.__hmrId as string | undefined) : undefined;
    if (hmrId) {
      hmrIndex.set(hmrId, { appName, key, lib: lib as Record<string, any> });
      ids.push(hmrId);
    }
  }
  return ids;
}

/**
 * 用新组件替换暴露对象中的对应槽位，并广播 `REMOTE_UPDATE`。
 * 未命中时返回 false（例如非组件导出或映射已清理）。
 */
function applyComponentUpdate(hmrId: string, resolveNew: (current: any) => any): boolean {
  const slot = hmrIndex.get(hmrId);
  if (!slot) {
    return false;
  }
  slot.lib[slot.key] = resolveNew(slot.lib[slot.key]);
  linkInstance.eventBus.emit(REMOTE_UPDATE, { appName: slot.appName, key: slot.key } satisfies RemoteUpdatePayload);
  return true;
}

function clearAppHmr(appName?: string): void {
  if (!appName) {
    hmrIndex.clear();
    return;
  }
  for (const [hmrId, slot] of hmrIndex) {
    if (slot.appName === appName) {
      hmrIndex.delete(hmrId);
    }
  }
}

function hasVueHmrRuntime(): boolean {
  return typeof (globalThis as any).__VUE_HMR_RUNTIME__ !== 'undefined';
}

/**
 * 安装最小 `__VUE_HMR_RUNTIME__` shim。
 *
 * 仅当宿主为 PROD（共享 Vue 是 prod build，未创建真实 HMR runtime）时调用；
 * 接管 plugin-vue accept 回调的 `reload/rerender` 出口，替换暴露槽位并广播更新。
 * 若真实 runtime 已存在（宿主 DEV），不做任何事并返回 false。
 */
function installVueHmrRuntimeShim(): boolean {
  const g = globalThis as any;
  if (g.__VUE_HMR_RUNTIME__) {
    return false;
  }
  const runtime: VueHmrRuntime = {
    createRecord() {
      return true;
    },
    rerender(id, render) {
      applyComponentUpdate(id, (current) => ({ ...current, render }));
    },
    reload(id, newComp) {
      applyComponentUpdate(id, () => newComp);
    },
    CHANGED_FILE: undefined,
  };
  g.__VUE_HMR_RUNTIME__ = runtime;
  return true;
}

/**
 * 持久监听 `LIB_EXPOSE`：首次 expose 由 loader 的 promise 解析逻辑处理；
 * 之后同一 appName 的再次 expose（HMR 入口变化）视为更新，交给一次性的
 * loader 监听处理并通过 `onRemoteUpdate` 广播。
 *
 * 这里只负责建立组件槽位索引，缓存与事件的更新在 loader 层完成。
 */
function setupHmrIndexing(): void {
  linkInstance.eventBus.on(LIB_EXPOSE, (data: { libName?: string; lib?: any } | undefined) => {
    if (!data || !data.libName || !data.lib) {
      return;
    }
    indexExposedLib(data.libName, data.lib);
  });
}

/**
 * 订阅某个远程应用（entry 的 appName 部分）的更新，返回取消订阅函数。
 */
function subscribeRemoteUpdate(entry: string, cb: (payload: RemoteUpdatePayload) => void): () => void {
  const appName = entry.split('/')[0];
  const handler = (data: RemoteUpdatePayload) => {
    if (data && data.appName === appName) {
      cb(data);
    }
  };
  linkInstance.eventBus.on(REMOTE_UPDATE, handler);
  return () => linkInstance.eventBus.off(REMOTE_UPDATE, handler);
}

export {
  indexExposedLib,
  applyComponentUpdate,
  clearAppHmr,
  hasVueHmrRuntime,
  installVueHmrRuntimeShim,
  setupHmrIndexing,
  subscribeRemoteUpdate,
};
export type { RemoteUpdatePayload, VueHmrRuntime };
