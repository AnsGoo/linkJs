// 导入 semver 库的版本比较相关函数
import { satisfies, maxSatisfying, coerce, valid, Range } from 'semver';

/** 版本信息接口 */
interface VersionInfo {
  version: string;
  module: any;
}

/** 版本比较器类，用于处理版本匹配和比较操作 */
export class VersionComparator {
  /**
   * 在已加载版本和可用版本中查找最佳匹配的版本
   * @param versionRange 版本范围要求
   * @param loadedVersions 已加载的版本列表
   * @param availableVersions 可用的版本列表
   * @returns 最佳匹配的版本信息，如果没有匹配则返回 null
   */
  static findBestMatch(
    versionRange: string | undefined,
    loadedVersions: VersionInfo[],
    availableVersions: VersionInfo[],
  ): VersionInfo | null {
    if (!versionRange) {
      return null;
    }

    // 创建版本范围对象
    const range = new Range(versionRange);

    // 在已加载的版本中查找匹配的版本
    const loadedMatches = loadedVersions.filter((v) => {
      const version = coerce(v.version);
      return version && valid(version) && range.test(version);
    });

    // 如果有已加载的匹配版本，返回最佳匹配
    if (loadedMatches.length > 0) {
      const versions = loadedMatches.map((v) => coerce(v.version)).filter((v): v is NonNullable<typeof v> => v !== null);
      const bestVersion = maxSatisfying(versions, versionRange);
      if (bestVersion) {
        return loadedMatches.find((v) => coerce(v.version)?.version === bestVersion.version) || null;
      }
    }

    // 在可用版本中查找匹配的版本
    const availableMatches = availableVersions.filter((v) => {
      const version = coerce(v.version);
      return version && valid(version) && range.test(version);
    });

    // 如果有可用的匹配版本，返回最佳匹配
    if (availableMatches.length > 0) {
      const versions = availableVersions.map((v) => coerce(v.version)).filter((v): v is NonNullable<typeof v> => v !== null);
      const bestVersion = maxSatisfying(versions, versionRange);
      if (bestVersion) {
        return availableMatches.find((v) => coerce(v.version)?.version === bestVersion.version) || null;
      }
    }

    return null;
  }

  /**
   * 查找版本列表中的最新版本
   * @param versions 版本信息列表
   * @returns 最新版本信息，如果列表为空则返回 null
   */
  static findLatestVersion(versions: VersionInfo[]): VersionInfo | null {
    if (versions.length === 0) {
      return null;
    }

    // 过滤并转换有效版本
    const validVersions = versions.map((v) => ({ ...v, coerced: coerce(v.version) })).filter((v) => v.coerced && valid(v.coerced));

    // 如果没有有效版本，返回第一个版本
    if (validVersions.length === 0) {
      return versions[0];
    }

    // 按版本号排序
    validVersions.sort((a, b) => {
      if (!a.coerced || !b.coerced) return 0;
      return a.coerced.compare(b.coerced);
    });

    // 返回最后一个（最新的）版本
    return validVersions[validVersions.length - 1];
  }

  /**
   * 检查版本是否满足指定的版本范围
   * @param version 要检查的版本号
   * @param versionRange 版本范围
   * @returns 如果版本满足范围则返回 true，否则返回 false
   */
  static satisfiesVersion(version: string, versionRange: string): boolean {
    const coerced = coerce(version);
    if (!coerced || !valid(coerced)) {
      return false;
    }
    return satisfies(coerced, versionRange);
  }

  /**
   * 验证版本号是否有效
   * @param version 要验证的版本号
   * @returns 如果版本号有效则返回 true，否则返回 false
   */
  static isValidVersion(version: string): boolean {
    const coerced = coerce(version);
    return coerced !== null && valid(coerced) !== null;
  }
}
