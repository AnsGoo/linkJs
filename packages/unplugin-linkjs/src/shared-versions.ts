import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

/**
 * 构建期注入共享依赖版本。
 *
 * 运行期无法可靠得知共享依赖（如 pinia / vue-router）的版本——它们不导出 `version`，
 * 但**构建插件**可以从 `node_modules` 读到已安装版本。本插件：
 * 1. 通过 `transformIndexHtml` 向页面注入 `globalThis.__LINKJS_SHARED_VERSIONS__`，
 *    运行时 `registerShare` 会自动为未声明 `version` 的共享依赖补齐（DevTools/版本诊断用）；
 * 2. 同时提供虚拟模块 `virtual:linkjs-shared`（需要显式读取时使用）。
 *
 * 用法（Vite）：
 * ```ts
 * import { linkjsSharedVersions } from 'unplugin-linkjs';
 * plugins: [linkjsSharedVersions()]  // 缺省收集 package.json 的依赖版本
 * ```
 */

const nodeRequire = createRequire(import.meta.url);

export const LINKJS_SHARED_VIRTUAL_ID = 'virtual:linkjs-shared';
const RESOLVED_ID = `\0${LINKJS_SHARED_VIRTUAL_ID}`;
const GLOBAL_KEY = '__LINKJS_SHARED_VERSIONS__';

export interface SharedVersionsOptions {
  /** 需要收集版本的包名；缺省取 package.json 的 dependencies + peerDependencies。 */
  packages?: string[];
}

/** 读取已安装版本的 package.json（解析失败返回 0.0.0）。 */
function installedVersion(name: string): string {
  try {
    const pkgPath = nodeRequire.resolve(`${name}/package.json`, { paths: [process.cwd()] });
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** 收集共享依赖版本（包名缺省取项目 package.json 的依赖）。 */
export function collectSharedVersions(options: SharedVersionsOptions = {}): Record<string, string> {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const names = options.packages ?? Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
  const versions: Record<string, string> = {};
  for (const name of names) {
    versions[name] = installedVersion(name);
  }
  return versions;
}

/** 生成注入共享依赖版本的 Vite/Rollup 插件。 */
export function linkjsSharedVersions(options: SharedVersionsOptions = {}) {
  return {
    name: 'linkjs-shared-versions',
    resolveId(id: string) {
      return id === LINKJS_SHARED_VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id: string) {
      if (id !== RESOLVED_ID) {
        return null;
      }
      return `export default ${JSON.stringify(collectSharedVersions(options))};`;
    },
    // Vite：向 HTML 注入全局，运行时自动补齐未声明版本的共享依赖。
    transformIndexHtml() {
      const versions = collectSharedVersions(options);
      return [
        {
          tag: 'script',
          injectTo: 'head-prepend' as const,
          children: `globalThis.${GLOBAL_KEY}=${JSON.stringify(versions)};`,
        },
      ];
    },
  };
}
