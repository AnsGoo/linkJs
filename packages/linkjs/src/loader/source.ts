import type { RegistryOption, RemoteHealthCheck, RemoteSource, RemoteSourceStrategy } from '../state/instance';

const DEFAULT_HEALTH_PATH = 'manifest.json';
const DEFAULT_HEALTH_TIMEOUT = 3000;
const DEFAULT_HEALTH_INTERVAL = 30000;

interface HealthRecord {
  healthy: boolean;
  time: number;
}

// 源健康结果缓存：`appName::base -> { healthy, time }`，按 `healthCheck.interval` 失效。
const healthCache = new Map<string, HealthRecord>();

function sourceBase(source: RemoteSource): string | undefined {
  return source.publicPath || source.host;
}

function sourceKey(appName: string, source: RemoteSource): string {
  return `${appName}::${sourceBase(source) ?? ''}`;
}

function healthUrl(source: RemoteSource, health?: RemoteHealthCheck): string | undefined {
  const base = sourceBase(source);
  if (!base) {
    return undefined;
  }
  const path = health?.path ?? DEFAULT_HEALTH_PATH;
  return new URL(path, base.endsWith('/') ? base : `${base}/`).href;
}

/**
 * 探测单个源是否健康：`GET ${base}/${healthCheck.path}`，`response.ok` 视为健康。
 * 结果按 `healthCheck.interval` 缓存（默认 30s），避免每次加载都探测。
 */
async function checkRemoteHealth(source: RemoteSource, health?: RemoteHealthCheck, appName = ''): Promise<boolean> {
  const url = healthUrl(source, health);
  if (!url) {
    return false;
  }

  const interval = health?.interval ?? DEFAULT_HEALTH_INTERVAL;
  const key = sourceKey(appName, source);
  if (interval > 0) {
    const cached = healthCache.get(key);
    if (cached && Date.now() - cached.time < interval) {
      return cached.healthy;
    }
  }

  const timeout = health?.timeout ?? DEFAULT_HEALTH_TIMEOUT;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), timeout);
  let healthy = false;
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    healthy = response.ok;
  } catch {
    healthy = false;
  } finally {
    clearTimeout(timer);
  }

  if (interval > 0) {
    healthCache.set(key, { healthy, time: Date.now() });
  }
  return healthy;
}

/** 按权重随机挑选（权重非正者按 0 处理；全为 0 时退回首项）。 */
function pickWeighted<T>(items: T[], weightOf: (item: T) => number, random: () => number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) {
    return items[0];
  }
  let threshold = random() * total;
  for (const item of items) {
    threshold -= Math.max(0, weightOf(item));
    if (threshold <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

export interface SelectRemoteSourceOptions {
  /** 覆盖远程声明的策略。 */
  strategy?: RemoteSourceStrategy;
  /** 覆盖远程声明的健康检查配置。 */
  health?: RemoteHealthCheck;
  /** 随机源（默认 `Math.random`），便于测试 / 稳定灰度种子。 */
  random?: () => number;
  /** 跳过健康探测（例如已由 retry 插件兜底多源）。 */
  skipHealthCheck?: boolean;
}

/**
 * 从远程的多源列表中选择一个源（**健康检查 + 灰度**）。
 *
 * - `first-healthy`（默认）：按声明顺序取首个健康源；全部不健康时回退首个（交由 retry/上层兜底）。
 * - `weighted`：在健康源中按 `weight` 随机挑选（灰度）；全部不健康时在所有源中按权重挑选。
 *
 * 未声明 `sources` 时返回 `undefined`。
 */
async function selectRemoteSource(
  remoteInfo: RegistryOption,
  appName: string,
  options: SelectRemoteSourceOptions = {},
): Promise<RemoteSource | undefined> {
  const sources = remoteInfo.sources;
  if (!sources?.length) {
    return undefined;
  }
  const strategy = options.strategy ?? remoteInfo.sourceStrategy ?? 'first-healthy';
  const health = options.health ?? remoteInfo.healthCheck;
  const random = options.random ?? Math.random;

  if (strategy === 'weighted') {
    let healthy = sources;
    if (!options.skipHealthCheck) {
      const probed = await Promise.all(sources.map(async (source) => ({ source, ok: await checkRemoteHealth(source, health, appName) })));
      const passed = probed.filter((item) => item.ok).map((item) => item.source);
      healthy = passed.length ? passed : sources;
    }
    return pickWeighted(healthy, (source) => source.weight ?? 1, random);
  }

  for (const source of sources) {
    if (options.skipHealthCheck || (await checkRemoteHealth(source, health, appName))) {
      return source;
    }
  }
  return sources[0];
}

/** 清空健康结果缓存（全部或指定远程）。 */
function clearHealthCache(appName?: string): void {
  if (!appName) {
    healthCache.clear();
    return;
  }
  const prefix = `${appName}::`;
  for (const key of healthCache.keys()) {
    if (key.startsWith(prefix)) {
      healthCache.delete(key);
    }
  }
}

export { selectRemoteSource, checkRemoteHealth, clearHealthCache };
