/**
 * 性能标记：用 `performance.mark/measure` 记录远程加载各阶段耗时。
 *
 * 无 `performance`（如 Node/SSR）时安全降级为空操作。面板/控制台可经
 * `getPerfEntries()` 读取，或直接用浏览器 Performance 面板查看。
 */

export interface PerfEntry {
  /** 技术名，如 `linkjs:load:app:remote:fetch`。 */
  name: string;
  /** 人类可读标签，如 `拉取入口 HTML「remote」`。 */
  label?: string;
  durationMs: number;
  startTime: number;
}

const MAX_ENTRIES = 200;
const hasPerf = typeof performance !== 'undefined' && typeof performance.mark === 'function';

// 用 global 兜底存储：避免因打包/入口拆分导致模块重复实例化而读不到彼此的数据。
function store(): PerfEntry[] {
  const g = globalThis as { __linkjs_perf__?: PerfEntry[] };
  return (g.__linkjs_perf__ ??= []);
}

function mark(name: string): void {
  if (hasPerf) {
    try {
      performance.mark(name);
    } catch {
      /* ignore */
    }
  }
}

/** 结束某个阶段并记录耗时（`name` 建议形如 `linkjs:load:app:remote:fetch`）。 */
function measure(name: string, startMark: string, endMark: string, label?: string): number {
  if (!hasPerf) {
    return 0;
  }
  try {
    performance.measure(name, startMark, endMark);
    const list = performance.getEntriesByName(name);
    const entry = list[list.length - 1] as PerformanceMeasure | undefined;
    const durationMs = entry?.duration ?? 0;
    const entries = store();
    entries.push({ name, label, durationMs, startTime: entry?.startTime ?? 0 });
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    return durationMs;
  } catch {
    return 0;
  }
}

/** 一个远程加载阶段计时的便捷封装：`const end = startPhase('fetch', '拉取入口 HTML「x」'); ...; end();` */
function startPhase(name: string, label?: string): () => number {
  const start = `${name}:start`;
  const end = `${name}:end`;
  mark(start);
  return () => {
    mark(end);
    return measure(name, start, end, label);
  };
}

function getPerfEntries(): PerfEntry[] {
  return [...store()];
}

function clearPerfEntries(): void {
  store().length = 0;
}

export { mark, measure, startPhase, getPerfEntries, clearPerfEntries };
