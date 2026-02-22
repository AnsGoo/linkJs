import type Module from 'module';
import { getInstance } from '..';
import type { ShareOption } from '../state/instance';
import { VersionComparator } from './version-comparator';

export type { ShareOption };

/**
 * 注册共享模块配置
 * @param options - 共享模块选项的键值对
 */
function registerShare(options: Record<string, ShareOption>) {
  for (const name in options) {
    const option = options[name];
    const { scope = 'global' } = option;
    const instance = getInstance();
    const shareds = instance.shares;
    if (!shareds.has(scope)) {
      shareds.set(scope, new Map());
    }
    const scopeMap = shareds.get(scope);
    if (scopeMap.has(name)) {
      const shareInfo = scopeMap.get(name);
      if (shareInfo.singleton) {
        continue;
      } else {
        shareInfo.push(option);
      }
    }
    scopeMap.set(name, [option]);
  }
}

async function loadModule(shareInfo: any): Promise<Module> {
  let libModule: Module = shareInfo.lib;
  if (typeof shareInfo.lib === 'function') {
    const libload = await shareInfo.lib();
    if (libload instanceof Promise) {
      libModule = await libload;
    } else {
      libModule = libload;
    }
  }
  return libModule;
}

async function loadAndCacheModule(name: string, shareInfo: any, loadedModules: Map<string, Module>): Promise<Module> {
  const libModule = await loadModule(shareInfo);
  const versionKey = `${name}@${shareInfo.version || '0.0.0'}`;
  loadedModules.set(versionKey, libModule);
  return libModule;
}

async function loadShareVersionFirst(
  name: string,
  version: string | undefined,
  shareInfos: any[],
  loadedModules: Map<string, Module>,
  loadedVersions: Array<{ version: string; module: any }>,
): Promise<Module | null> {
  if (!version) {
    if (loadedVersions.length > 0) {
      const latestLoaded = VersionComparator.findLatestVersion(loadedVersions);
      return Promise.resolve(latestLoaded?.module || null);
    }

    const latestShare = VersionComparator.findLatestVersion(
      shareInfos.map((info: any) => ({ version: info.version || '0.0.0', module: info })),
    );

    if (latestShare) {
      const shareInfo = latestShare.module;
      return loadAndCacheModule(name, shareInfo, loadedModules);
    }

    return Promise.resolve(null);
  }

  const loadedMatch = VersionComparator.findBestMatch(version, loadedVersions, []);

  if (loadedMatch) {
    return Promise.resolve(loadedMatch.module);
  }

  const availableVersions = shareInfos.map((info: any) => ({
    version: info.version || '0.0.0',
    module: info,
  }));

  const bestMatch = VersionComparator.findBestMatch(version, [], availableVersions);

  if (bestMatch) {
    const shareInfo = bestMatch.module;
    return loadAndCacheModule(name, shareInfo, loadedModules);
  }

  return Promise.resolve(null);
}

async function loadShareLoadedFirst(
  name: string,
  version: string | undefined,
  shareInfos: any[],
  loadedModules: Map<string, Module>,
  loadedVersions: Array<{ version: string; module: any }>,
): Promise<Module | null> {
  if (!version) {
    if (loadedVersions.length > 0) {
      const latestLoaded = VersionComparator.findLatestVersion(loadedVersions);
      return Promise.resolve(latestLoaded?.module || null);
    }

    const latestShare = VersionComparator.findLatestVersion(
      shareInfos.map((info: any) => ({ version: info.version || '0.0.0', module: info })),
    );

    if (latestShare) {
      const shareInfo = latestShare.module;
      return loadAndCacheModule(name, shareInfo, loadedModules);
    }

    return Promise.resolve(null);
  }

  const loadedMatch = VersionComparator.findBestMatch(version, loadedVersions, []);

  if (loadedMatch) {
    return Promise.resolve(loadedMatch.module);
  }

  const availableVersions = shareInfos.map((info: any) => ({
    version: info.version || '0.0.0',
    module: info,
  }));

  const bestMatch = VersionComparator.findBestMatch(version, [], availableVersions);

  if (bestMatch) {
    const shareInfo = bestMatch.module;
    return loadAndCacheModule(name, shareInfo, loadedModules);
  }

  return Promise.resolve(null);
}

/**
 * 加载共享模块
 * 规则：
 * 1. 当未指定版本时，默认取已加载的Module，如果未加载则加载已共享的最新版本
 * 2. 当指定了版本时，优先返回已加载的匹配版本
 * 3. 当指定了版本但已加载版本不匹配时，加载匹配的版本
 * 4. 当指定了版本但不存在匹配版本时，返回null
 * @param name - 模块名称
 * @param options - 选项，包含版本和作用域
 * @returns Promise<Module | null>
 */
async function loadShare(
  name: string,
  options?: {
    version?: string;
    scope?: string;
  },
) {
  const instance = getInstance();
  const { scope = 'global', version } = options || {};

  const shares = instance.shares.get(scope);
  if (!shares || !shares.has(name)) {
    return Promise.resolve(null);
  }

  const shareInfos = shares.get(name);
  if (!shareInfos || shareInfos.length === 0) {
    return Promise.resolve(null);
  }

  const sharedMap = instance.sharedMap;
  if (!sharedMap.has(scope)) {
    sharedMap.set(scope, new Map());
  }
  const loadedModules = sharedMap.get(scope);

  const loadedVersions: Array<{ version: string; module: any }> = [];
  loadedModules.forEach((module: any, key: string) => {
    if (key.startsWith(`${name}@`)) {
      loadedVersions.push({
        version: key.split('@')[1],
        module,
      });
    }
  });

  const strategy = instance.shareStrategy || 'loaded-first';

  if (strategy === 'version-first') {
    return loadShareVersionFirst(name, version, shareInfos, loadedModules, loadedVersions);
  } else {
    return loadShareLoadedFirst(name, version, shareInfos, loadedModules, loadedVersions);
  }
}

function getShareVersionFirst(
  version: string | undefined,
  loadedVersions: Array<{ version: string; module: any }>,
): Module | null {
  if (!version) {
    if (loadedVersions.length > 0) {
      const latestLoaded = VersionComparator.findLatestVersion(loadedVersions);
      return latestLoaded?.module || null;
    }
    return null;
  }

  const bestMatch = VersionComparator.findBestMatch(version, loadedVersions, []);

  return bestMatch?.module || null;
}

function getShareLoadedFirst(
  version: string | undefined,
  loadedVersions: Array<{ version: string; module: any }>,
): Module | null {
  if (!version) {
    if (loadedVersions.length > 0) {
      const latestLoaded = VersionComparator.findLatestVersion(loadedVersions);
      return latestLoaded?.module || null;
    }
    return null;
  }

  const bestMatch = VersionComparator.findBestMatch(version, loadedVersions, []);

  return bestMatch?.module || null;
}

/**
 * 获取已加载的共享模块
 * 规则：
 * 1. 当未指定版本时，默认取已加载的Module，如果未加载则返回null
 * 2. 当指定了版本时，返回满足版本要求的已加载的最新版本
 * 3. 当指定了版本但不匹配任何已加载版本时，返回null
 * @param name - 模块名称
 * @param options - 选项，包含版本和作用域
 * @returns Module | null
 */
function getShare(
  name: string,
  options: {
    version?: string;
    scope?: string;
  },
) {
  const instance = getInstance();
  const { scope = 'global', version } = options || {};

  const sharedMap = instance.sharedMap.get(scope);
  if (!sharedMap) {
    return null;
  }

  const loadedVersions: Array<{ version: string; module: any }> = [];
  sharedMap.forEach((module: any, key: string) => {
    if (key.startsWith(`${name}@`)) {
      loadedVersions.push({
        version: key.split('@')[1],
        module,
      });
    }
  });

  const strategy = instance.shareStrategy || 'loaded-first';

  if (strategy === 'version-first') {
    return getShareVersionFirst(version, loadedVersions);
  } else {
    return getShareLoadedFirst(version, loadedVersions);
  }
}

export { registerShare, loadShare, getShare };
