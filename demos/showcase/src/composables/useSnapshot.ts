import { onMounted, onUnmounted, ref } from 'vue';
import { getSnapshot } from 'linkjs';

export interface DepRow {
  name: string;
  version?: string;
  required?: boolean;
  status?: string;
  resolved?: string;
}
export interface RemoteRow {
  name: string;
  displayName?: string;
  type?: string;
  status?: string;
  host?: string;
  version?: string;
  shared?: Record<string, unknown>;
  deps?: DepRow[];
}
export interface ShareRow {
  scope: string;
  name: string;
  versions: Array<{ version: string; loaded?: boolean; provider?: string }>;
}
export interface SnapshotShape {
  instance?: { id?: string; name?: string; version?: string; mode?: string; shareStrategy?: string; origin?: string };
  remotes?: RemoteRow[];
  shares?: ShareRow[];
  events?: Array<{ type: string; time: number; summary: string }>;
  metrics?: Array<{ entry: string; kind: string; host?: string; durationMs: number; status: string; time: number }>;
  perf?: Array<{ name: string; label?: string; durationMs: number }>;
  conflicts?: Array<{ scope: string; name: string; requiredVersion: string; provided: string[] }>;
  diagnostics?: Array<{ level: string; code: string; message: string; time: number }>;
  plugins?: string[];
  availablePlugins?: Array<{ name: string; description: string; enabled: boolean }>;
}

/** 轮询 linkjs 快照，供示例页实时展示。 */
export function useSnapshot(intervalMs = 700) {
  const snapshot = ref<SnapshotShape>({});
  let timer: ReturnType<typeof setInterval> | undefined;

  const read = () => {
    try {
      snapshot.value = (getSnapshot() as SnapshotShape) || {};
    } catch {
      snapshot.value = {};
    }
  };

  onMounted(() => {
    read();
    timer = setInterval(read, intervalMs);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { snapshot, refresh: read };
}
