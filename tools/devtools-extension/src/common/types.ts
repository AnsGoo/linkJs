/** 数据源异常状态（无 linkjs / 无法访问 / 读取失败）。 */
export interface SnapshotState {
  __state: 'missing' | 'error' | 'unreachable';
  message?: string;
}

export interface RemoteSnapshot {
  name: string;
  displayName?: string;
  type?: string;
  status?: string;
  host?: string;
  version?: string;
  shareScope?: string[];
  entry?: string | Record<string, unknown>;
  shared?: Record<string, unknown>;
  integrity?: Record<string, string>;
  [key: string]: unknown;
}

export interface ShareVersionSnapshot {
  version: string;
  loaded?: boolean;
  requiredVersion?: string | false;
  strictVersion?: boolean;
  eager?: boolean;
}

export interface Snapshot {
  instance?: { id?: string; name?: string; version?: string; mode?: string; shareStrategy?: string; origin?: string };
  remotes?: RemoteSnapshot[];
  shares?: Array<{ scope: string; name: string; versions: ShareVersionSnapshot[] }>;
  conflicts?: Array<{ scope: string; name: string; requiredVersion: string; provided: string[] }>;
  plugins?: string[];
  availablePlugins?: Array<{ name: string; description: string; enabled: boolean }>;
  metrics?: Array<{ entry: string; kind: string; host?: string; durationMs: number; status: 'loaded' | 'error'; time: number }>;
  perf?: Array<{ name: string; label?: string; durationMs: number }>;
  events?: Array<{ type: string; time: number; summary: string }>;
  diagnostics?: Array<{ level: 'warn' | 'error'; code: string; message: string; time: number }>;
  [key: string]: unknown;
}

export type FetchResult = Snapshot | SnapshotState;

export interface Source {
  fetchSnapshot: () => Promise<FetchResult>;
  onAction: (op: string, arg?: unknown) => void;
}

export function isState(value: unknown): value is SnapshotState {
  return !!value && typeof value === 'object' && '__state' in (value as Record<string, unknown>);
}
