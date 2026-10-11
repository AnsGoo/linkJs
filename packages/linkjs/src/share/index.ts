import { getInstance } from '..';
import type { ShareOption } from '../state/instance';
import type { RemoteModule } from '../types';
import { recordDiagnostic } from '../devtools';
import { startPhase } from '../perf';
import { VersionComparator } from './version-comparator';

export type { ShareOption };

interface VersionedModule {
  version: string;
  module: any;
}

interface Candidate extends VersionedModule {
  source: 'loaded' | 'available';
}

const DEFAULT_STRATEGY = 'version-first';

/**
 * 注册共享模块配置。
 *
 * - `singleton: true`：同一作用域下同名只允许一个版本，首个注册者胜出，后续注册忽略。
 * - 非单例：允许注册多个版本，追加保存。
 */
function registerShare(options: Record<string, ShareOption>) {
  const instance = getInstance();
  // 构建插件注入的共享依赖版本（见 unplugin-linkjs 的 linkjsSharedVersions）。
  const injected = (globalThis as { __LINKJS_SHARED_VERSIONS__?: Record<string, string> })
    .__LINKJS_SHARED_VERSIONS__;
  for (const name in options) {
    const raw = options[name];
    // 未声明 version 时用构建期注入的版本补齐（DevTools / 版本诊断使用）。
    const option: ShareOption = raw.version || !injected?.[name] ? raw : { ...raw, version: injected[name] };
    const scope = option.scope || 'global';
    let scopeMap = instance.shares.get(scope);
    if (!scopeMap) {
      scopeMap = new Map();
      instance.shares.set(scope, scopeMap);
    }

    const existing: ShareOption[] = scopeMap.get(name) || [];
    const hasSingleton = existing.some((info) => info.singleton);
    if (existing.length > 0 && hasSingleton) {
      // 已注册单例，忽略后续注册
      continue;
    }
    scopeMap.set(name, [...existing, option]);

    // eager：注册后立即加载（运行时近似 Module Federation 的 eager 语义）。
    if (option.eager) {
      void loadShare(name, {
        scope,
        version: option.version,
        requiredVersion: option.requiredVersion,
        strictVersion: option.strictVersion,
      }).catch((error) => {
        console.warn(`[linkjs] eager shared "${name}" failed to load:`, error);
      });
    }
  }
}

/** 版本不满足 `requiredVersion` 时的诊断（strict 则抛错）。 */
function warnVersionMismatch(
  name: string,
  resolved: string,
  requirement: string | false | undefined,
  strict: boolean | undefined,
): void {
  if (!requirement) {
    return;
  }
  if (VersionComparator.satisfiesVersion(resolved, requirement)) {
    return;
  }
  const message = `shared "${name}": resolved version ${resolved} does not satisfy requiredVersion ${requirement}`;
  if (strict) {
    throw new Error(`[linkjs] ${message}`);
  }
  recordDiagnostic({
    level: 'warn',
    code: 'SHARE_VERSION_MISMATCH',
    message,
    context: { name, resolved, requirement },
  });
}

async function loadModule(shareInfo: ShareOption): Promise<RemoteModule> {
  let libModule: RemoteModule = shareInfo.lib as RemoteModule;
  if (typeof shareInfo.lib === 'function') {
    const libload = await (shareInfo.lib as () => any)();
    libModule = libload instanceof Promise ? await libload : libload;
  }
  return libModule;
}

function getInflightMap(instance: any): Map<string, Promise<RemoteModule>> {
  if (!instance.shareInflight) {
    instance.shareInflight = new Map<string, Promise<RemoteModule>>();
  }
  return instance.shareInflight;
}

/**
 * 加载并缓存共享模块，并合并同一 name@version 的并发加载。
 */
function loadAndCacheModule(
  instance: any,
  scope: string,
  name: string,
  shareInfo: ShareOption,
  loadedModules: Map<string, RemoteModule>,
): Promise<RemoteModule> {
  const version = shareInfo.version || '0.0.0';
  const versionKey = `${name}@${version}`;

  const cached = loadedModules.get(versionKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflightKey = `${scope}::${versionKey}`;
  const inflight = getInflightMap(instance);
  const running = inflight.get(inflightKey);
  if (running) {
    return running;
  }

  // 统计共享依赖实际加载耗时（缓存命中/并发复用时不计）。
  const endPhase = startPhase(`linkjs:share:${name}`, `加载共享依赖「${name}」`);
  const promise = loadModule(shareInfo)
    .then((mod) => {
      loadedModules.set(versionKey, mod);
      return mod;
    })
    .finally(() => {
      inflight.delete(inflightKey);
      endPhase();
    });

  inflight.set(inflightKey, promise);
  return promise;
}

function collectLoaded(sharedMap: Map<string, RemoteModule>, name: string): VersionedModule[] {
  const loaded: VersionedModule[] = [];
  sharedMap.forEach((module, key) => {
    if (key.startsWith(`${name}@`)) {
      loaded.push({ version: key.slice(name.length + 1), module });
    }
  });
  return loaded;
}

function toCandidates(loaded: VersionedModule[], available: ShareOption[]): Candidate[] {
  return [
    ...loaded.map((item) => ({ ...item, source: 'loaded' as const })),
    ...available.map((info) => ({ version: info.version || '0.0.0', module: info, source: 'available' as const })),
  ];
}

/**
 * 版本优先：在「已加载 + 可用」候选中选满足条件的最高版本；若该版本未加载则加载。
 * 未指定版本时选取所有候选中的最高版本。
 */
async function resolveVersionFirst(
  instance: any,
  scope: string,
  name: string,
  version: string | undefined,
  available: ShareOption[],
  loadedModules: Map<string, RemoteModule>,
  loaded: VersionedModule[],
  requirement: string | false | undefined,
  strict: boolean | undefined,
): Promise<RemoteModule | null> {
  const candidates = toCandidates(loaded, available);
  const best = version
    ? VersionComparator.findBestMatch(version, candidates, [])
    : VersionComparator.findLatestVersion(candidates);

  if (!best) {
    return null;
  }
  const candidate = best as Candidate;
  warnVersionMismatch(name, candidate.version, requirement, strict);
  if (candidate.source === 'loaded') {
    return candidate.module as RemoteModule;
  }
  return loadAndCacheModule(instance, scope, name, candidate.module as ShareOption, loadedModules);
}

/**
 * 已加载优先：优先复用已加载的（满足条件的）实例；没有时才从可用版本中加载。
 */
async function resolveLoadedFirst(
  instance: any,
  scope: string,
  name: string,
  version: string | undefined,
  available: ShareOption[],
  loadedModules: Map<string, RemoteModule>,
  loaded: VersionedModule[],
  requirement: string | false | undefined,
  strict: boolean | undefined,
): Promise<RemoteModule | null> {
  if (loaded.length > 0) {
    const bestLoaded = version
      ? VersionComparator.findBestMatch(version, loaded, [])
      : VersionComparator.findLatestVersion(loaded);
    if (bestLoaded) {
      warnVersionMismatch(name, bestLoaded.version, requirement, strict);
      return bestLoaded.module as RemoteModule;
    }
  }

  const availableCandidates: VersionedModule[] = available.map((info) => ({
    version: info.version || '0.0.0',
    module: info,
  }));
  const bestAvailable = version
    ? VersionComparator.findBestMatch(version, availableCandidates, [])
    : VersionComparator.findLatestVersion(availableCandidates);

  if (!bestAvailable) {
    return null;
  }
  warnVersionMismatch(name, bestAvailable.version, requirement, strict);
  return loadAndCacheModule(instance, scope, name, bestAvailable.module as ShareOption, loadedModules);
}

/**
 * 加载共享模块。
 *
 * 规则（version-first）：
 * 1. 指定版本：所有候选中满足范围的最高版本，必要时加载；
 * 2. 未指定版本：所有候选中的最高版本，必要时加载。
 *
 * 规则（loaded-first）：
 * 1. 已有满足条件的已加载实例：直接复用；
 * 2. 否则从可用版本中选择（指定版本取满足范围的最高版本，否则取最高版本）并加载。
 *
 * 两者都不存在匹配时返回 null。
 */
async function loadShare(
  name: string,
  options?: {
    version?: string;
    scope?: string;
    requiredVersion?: string | false;
    strictVersion?: boolean;
  },
): Promise<RemoteModule | null> {
  const instance = getInstance();
  const { scope = 'global', version } = options || {};

  const shares = instance.shares.get(scope);
  const available: ShareOption[] = shares?.get(name) || [];
  if (available.length === 0) {
    return null;
  }

  // 版本要求：优先调用方传入，其次取已注册声明里的 requiredVersion/strictVersion。
  const requirement = options?.requiredVersion ?? available.find((info) => info.requiredVersion !== undefined)?.requiredVersion;
  const strict = options?.strictVersion ?? available.find((info) => info.strictVersion !== undefined)?.strictVersion;

  let loadedModules = instance.sharedMap.get(scope);
  if (!loadedModules) {
    loadedModules = new Map<string, RemoteModule>();
    instance.sharedMap.set(scope, loadedModules);
  }
  const loaded = collectLoaded(loadedModules, name);

  const strategy = instance.shareStrategy || DEFAULT_STRATEGY;
  if (strategy === 'loaded-first') {
    return resolveLoadedFirst(instance, scope, name, version, available, loadedModules, loaded, requirement, strict);
  }
  return resolveVersionFirst(instance, scope, name, version, available, loadedModules, loaded, requirement, strict);
}

/**
 * 获取已加载的共享模块（两种策略一致，只看已加载）。
 *
 * 1. 指定版本：返回满足范围的已加载最高版本，否则 null；
 * 2. 未指定版本：返回已加载的最高版本，否则 null。
 */
function getShare(
  name: string,
  options?: {
    version?: string;
    scope?: string;
  },
): RemoteModule | null {
  const instance = getInstance();
  const { scope = 'global', version } = options || {};

  const sharedMap = instance.sharedMap.get(scope);
  if (!sharedMap) {
    return null;
  }

  const loaded = collectLoaded(sharedMap, name);
  const best = version
    ? VersionComparator.findBestMatch(version, loaded, [])
    : VersionComparator.findLatestVersion(loaded);

  return (best?.module as RemoteModule) || null;
}

export { registerShare, loadShare, getShare };
