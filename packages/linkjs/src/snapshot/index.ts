import { getInstance } from '..';
import { getPrefetch, getPrefetchRecords, getPrefetchVersion, type PrefetchRecord } from '../preload';

/** 远程加载状态。 */
export type RemoteLoadStatus = 'unloaded' | 'loading' | 'loaded';

/** 单个远程的运行时快照（加载状态 + 预取情况）。 */
export interface RemoteSnapshotEntry {
  name: string;
  status: RemoteLoadStatus;
  host?: string;
  displayName?: string;
  version?: string;
  /** 已预取 manifest 的地址（若已预取）。 */
  manifestUrl?: string;
  /** 已预取的资源 href（JS/CSS）。 */
  assets: string[];
  /** 是否已预取过 manifest。 */
  prefetched: boolean;
  /** 预取时间戳（ms）。 */
  time?: number;
}

/** 全局快照：所有已知（已注册 / 已预取）远程的状态汇总。 */
export interface GlobalSnapshot {
  /** 快照版本号：每次预取缓存变更自增，供消费方判断是否需要刷新。 */
  version: number;
  remotes: Record<string, RemoteSnapshotEntry>;
}

function toEntry(name: string, record?: PrefetchRecord): RemoteSnapshotEntry {
  const info = getInstance().remotes.get(name);
  return {
    name,
    status: (info?.status as RemoteLoadStatus | undefined) ?? 'unloaded',
    host: info?.host,
    displayName: info?.displayName,
    version: info?.version,
    manifestUrl: record?.manifestUrl,
    assets: record ? [...record.assets] : [],
    prefetched: Boolean(record),
    time: record?.time,
  };
}

/**
 * 查询单个远程的运行时快照。未注册且未预取时返回 `undefined`。
 * 可用于预取前判断「已加载 / 已预取」，避免重复请求。
 */
function remoteSnapshot(name: string): RemoteSnapshotEntry | undefined {
  const record = getPrefetch(name);
  if (!record && !getInstance().remotes.has(name)) {
    return undefined;
  }
  return toEntry(name, record);
}

/** 汇总所有已知远程的运行时快照（已注册 + 已预取）。 */
function globalSnapshot(): GlobalSnapshot {
  const names = new Set<string>(getInstance().remotes.keys());
  for (const record of getPrefetchRecords()) {
    if (record.name) {
      names.add(record.name);
    }
  }

  const remotes: Record<string, RemoteSnapshotEntry> = {};
  for (const name of names) {
    remotes[name] = toEntry(name, getPrefetch(name));
  }
  return { version: getPrefetchVersion(), remotes };
}

export { remoteSnapshot, globalSnapshot };
