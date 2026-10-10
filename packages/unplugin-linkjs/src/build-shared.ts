import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { extractPkgName } from './dependency-graph.js';

export interface SharedEntryOptions {
  outDir: string;
  baseDir: string;
  shared: Record<string, any>;
  bundle: Record<string, any>;
  sharedPkgMap: Map<string, string>;
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 生成共享依赖入口文件 `shared.js`。
 *
 * 不额外做一次打包，而是复用主构建已经产出的 chunk：
 * 通过每个 chunk 的 `facadeModuleId` 解析出真实包名，再映射回共享依赖名称，
 * 最终生成形如：
 *
 * ```js
 * export default {
 *   Vue: () => import('./vue.runtime.esm-bundler-xxxx.js'),
 *   VueRouter: () => import('./vue-router-xxxx.js'),
 * };
 * ```
 *
 * 这样宿主在加载主入口前 import 该文件即可拿到远程提供的共享依赖，且不会重复打包。
 *
 * @returns 写回 manifest 的 entry.shared 路径；无需生成时返回 null
 */
export function generateSharedEntryFile(options: SharedEntryOptions): string | null {
  const { outDir, baseDir, shared, bundle, sharedPkgMap } = options;
  const sharedKeys = Object.keys(shared);
  if (sharedKeys.length === 0) {
    return null;
  }

  // 共享依赖名称 -> 已有 chunk 文件名
  const chunkByShared = new Map<string, string>();
  for (const [fileName, item] of Object.entries(bundle)) {
    if (item?.type !== 'chunk') {
      continue;
    }
    const facadeModuleId: string | undefined = item.facadeModuleId;
    if (!facadeModuleId) {
      continue;
    }
    const pkgName = extractPkgName(facadeModuleId);
    if (!pkgName) {
      continue;
    }
    const sharedName = sharedPkgMap.get(pkgName);
    if (sharedName && sharedKeys.includes(sharedName) && !chunkByShared.has(sharedName)) {
      chunkByShared.set(sharedName, fileName);
    }
  }

  // 回退：按文件名最长匹配（处理拿不到 facadeModuleId 的情况）
  const chunkFileNames = Object.keys(bundle).filter((key) => bundle[key]?.type === 'chunk');
  const byLength = [...sharedKeys].sort((a, b) => b.length - a.length);
  for (const name of byLength) {
    if (chunkByShared.has(name)) {
      continue;
    }
    const matched = chunkFileNames.find((fileName) => fileName !== 'index.js' && fileName.includes(name));
    if (matched) {
      chunkByShared.set(name, matched);
    }
  }

  const lines = sharedKeys
    .map((name) => {
      const chunk = chunkByShared.get(name);
      if (!chunk) {
        return null;
      }
      return `  ${toPascalCase(name)}: () => import(${JSON.stringify(`./${chunk}`)}),`;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return null;
  }

  const content = `export default {\n${lines.join('\n')}\n};\n`;
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(join(outDir, 'shared.js'), content, 'utf-8');
  return join(baseDir, 'shared.js');
}
