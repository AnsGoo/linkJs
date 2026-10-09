import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * 生成依赖拓扑图
 * @param outDir 输出目录
 * @param dependencyGraph 依赖图
 * @param bundle 构建产物
 * @param sharedDeps 共享依赖关系
 */
export function generateDependencyGraph(
  outDir: string,
  dependencyGraph: Map<string, Set<string>>,
  bundle: any,
  sharedDeps: Record<string, string[]> = {},
  entrySharedDeps: string[] = []
) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 真实包名 -> 共享依赖名称的映射（基于 package.json 依赖闭包自动推导）
  const pkgMap = buildSharedPackageMap(Object.keys(sharedDeps));

  // 生成文本格式的依赖图
  const textGraph = generateTextGraph(dependencyGraph, sharedDeps, entrySharedDeps, pkgMap);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.txt'), textGraph, 'utf-8');

  // 生成JSON格式的依赖图
  const jsonGraph = generateJsonGraph(dependencyGraph, sharedDeps, entrySharedDeps, pkgMap);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.json'), JSON.stringify(jsonGraph, null, 2), 'utf-8');

  // 生成Mermaid格式的依赖图（用于可视化）
  const mermaidGraph = generateMermaidGraph(dependencyGraph, sharedDeps, entrySharedDeps, pkgMap);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.mmd'), mermaidGraph, 'utf-8');
}

/**
 * 生成文本格式的依赖图
 */
function generateTextGraph(
  dependencyGraph: Map<string, Set<string>>,
  sharedDeps: Record<string, string[]>,
  entrySharedDeps: string[] = [],
  pkgMap: Map<string, string> = new Map()
): string {
  let textGraph = '=== Dependency Graph ===\n\n';

  // 只处理 entry 文件和相关依赖
  const entryModules = identifyEntryModules(dependencyGraph);

  // 分析入口文件和共享依赖之间的依赖关系
  entryModules.forEach(moduleId => {
    const moduleName = path.basename(moduleId);
    textGraph += `${moduleName}\n`;

    // 入口声明的共享依赖优先；否则基于模块依赖图推断
    const collectedSharedDeps = entrySharedDeps.length > 0
      ? new Set(entrySharedDeps)
      : findUsedSharedDeps(moduleId, dependencyGraph, pkgMap);

    // 输出收集到的共享依赖
    if (collectedSharedDeps.size > 0) {
      Array.from(collectedSharedDeps).sort().forEach(dep => {
        textGraph += `  └── ${dep}\n`;
      });
    } else {
      textGraph += `  (no shared dependencies)\n`;
    }

    textGraph += '\n';
  });

  // 添加 shared 依赖拓扑图
  if (Object.keys(sharedDeps).length > 0) {
    textGraph += '=== Shared Dependencies Graph ===\n\n';
    const sharedEntries = Object.entries(sharedDeps);
    sharedEntries.sort((a, b) => a[0].localeCompare(b[0]));
    sharedEntries.forEach(([depName, deps]) => {
      textGraph += `${depName}\n`;
      if (deps.length > 0) {
        deps.forEach(dep => {
          textGraph += `  └── ${dep}\n`;
        });
      } else {
        textGraph += `  (no dependencies)\n`;
      }
      textGraph += '\n';
    });
  }

  // 添加统计信息
  textGraph += '=== Statistics ===\n';
  textGraph += `Entry modules: ${entryModules.size}\n`;
  if (Object.keys(sharedDeps).length > 0) {
    textGraph += `Shared dependencies: ${Object.keys(sharedDeps).length}\n`;
  }

  return textGraph;
}

/**
 * 生成JSON格式的依赖图
 */
function generateJsonGraph(
  dependencyGraph: Map<string, Set<string>>,
  sharedDeps: Record<string, string[]>,
  entrySharedDeps: string[] = [],
  pkgMap: Map<string, string> = new Map()
) {
  const entryModules = identifyEntryModules(dependencyGraph);
  const jsonGraph: Record<string, string[]> = {};

  entryModules.forEach(moduleId => {
    const collectedSharedDeps = entrySharedDeps.length > 0
      ? new Set(entrySharedDeps)
      : findUsedSharedDeps(moduleId, dependencyGraph, pkgMap);
    jsonGraph[moduleId] = Array.from(collectedSharedDeps).sort();
  });

  return {
    graph: jsonGraph,
    sharedDependencies: sharedDeps,
    statistics: {
      entryModules: entryModules.size,
      sharedDependencies: Object.keys(sharedDeps).length,
    },
  };
}

/**
 * 生成Mermaid格式的依赖图
 */
function generateMermaidGraph(
  dependencyGraph: Map<string, Set<string>>,
  sharedDeps: Record<string, string[]>,
  entrySharedDeps: string[] = [],
  pkgMap: Map<string, string> = new Map()
): string {
  const entryModules = identifyEntryModules(dependencyGraph);
  let mermaidGraph = 'graph TD\n';
  const nodeMap = new Map<string, string>();
  let nodeId = 0;

  // 添加 entry 节点
  entryModules.forEach(moduleId => {
    const sourceId = `N${nodeId++}`;
    const sourceName = path.basename(moduleId).replace(/\./g, '_');
    nodeMap.set(moduleId, sourceId);
    mermaidGraph += `  ${sourceId}["${sourceName}"]\n`;
  });

  // 添加 shared 依赖节点
  Object.keys(sharedDeps).forEach(dep => {
    if (!nodeMap.has(dep)) {
      const sourceId = `S${nodeId++}`;
      nodeMap.set(dep, sourceId);
      mermaidGraph += `  ${sourceId}["${dep}"]\n`;
    }
  });

  // 入口声明的共享依赖优先；否则基于模块依赖图推断
  const entryToSharedDeps: Record<string, Set<string>> = {};
  entryModules.forEach(moduleId => {
    entryToSharedDeps[moduleId] = entrySharedDeps.length > 0
      ? new Set(entrySharedDeps)
      : findUsedSharedDeps(moduleId, dependencyGraph, pkgMap);
  });

  // 添加 entry 到共享依赖的边
  entryModules.forEach(moduleId => {
    const sourceId = nodeMap.get(moduleId);
    const sharedDepsForEntry = entryToSharedDeps[moduleId];
    sharedDepsForEntry.forEach(dep => {
      const targetId = nodeMap.get(dep);
      if (targetId) {
        mermaidGraph += `  ${sourceId} --> ${targetId}\n`;
      }
    });
  });

  // 添加 shared 依赖之间的边
  if (Object.keys(sharedDeps).length > 0) {
    Object.entries(sharedDeps).forEach(([dep, deps]) => {
      const sourceId = nodeMap.get(dep);
      deps.forEach(d => {
        const targetId = nodeMap.get(d);
        if (targetId) {
          mermaidGraph += `  ${sourceId} --> ${targetId}\n`;
        }
      });
    });
  }

  return mermaidGraph;
}

/**
 * 识别入口模块
 */
function identifyEntryModules(dependencyGraph: Map<string, Set<string>>): Set<string> {
  const entryModules = new Set<string>();

  dependencyGraph.forEach((_, moduleId) => {
    const moduleName = path.basename(moduleId);
    if (moduleName === 'lib.ts' || moduleName.includes('lib') || moduleId.includes('src/lib')) {
      entryModules.add(moduleId);
    }
  });

  return entryModules;
}

/**
 * 从入口模块出发，找出其（直接或间接）使用到的所有共享依赖
 * @param entryModule 入口模块路径
 * @param dependencyGraph 依赖图
 * @param pkgMap 真实包名 -> 共享依赖名称的映射
 */
function findUsedSharedDeps(
  entryModule: string,
  dependencyGraph: Map<string, Set<string>>,
  pkgMap: Map<string, string>
): Set<string> {
  const used = new Set<string>();
  const visited = new Set<string>();

  const walk = (modulePath: string) => {
    if (visited.has(modulePath)) {
      return;
    }
    visited.add(modulePath);

    const deps = dependencyGraph.get(modulePath);
    if (!deps) {
      return;
    }

    deps.forEach(dep => {
      const pkgName = extractPkgName(dep);
      if (pkgName) {
        const sharedName = pkgMap.get(pkgName);
        if (sharedName) {
          used.add(sharedName);
        }
      }
      walk(dep);
    });
  };

  walk(entryModule);
  return used;
}

/**
 * 自动分析共享依赖之间的子依赖关系。
 *
 * 不使用打包后的模块依赖图，而是基于各共享依赖的 package.json 依赖闭包推导，
 * 原因：插件会把共享依赖的 import 改写成 `$linkjs.loadShare()`，会破坏解析后的模块依赖边。
 * 使用 package.json 闭包既能避开该问题，又天然通用（无需硬编码任何包名）。
 *
 * 例如：
 *   shared = { vue, pinia, vue-router }
 *   pinia 的闭包含 vue（peerDependency）        -> pinia 依赖 vue
 *   vue-router 的闭包含 vue                     -> vue-router 依赖 vue
 *
 * @param shared 共享依赖配置
 * @returns 每个共享依赖所依赖的其它共享依赖列表
 */
export function analyzeDependencies(shared: Record<string, any>): Record<string, string[]> {
  const sharedKeys = Object.keys(shared);
  const sharedSet = new Set(sharedKeys);
  const resolveFrom = process.cwd();

  const sharedDeps: Record<string, string[]> = {};
  sharedKeys.forEach((key) => {
    const deps: string[] = [];
    getPackageClosure(key, resolveFrom).forEach((dep) => {
      if (dep !== key && sharedSet.has(dep) && !deps.includes(dep)) {
        deps.push(dep);
      }
    });
    sharedDeps[key] = deps;
  });

  return sharedDeps;
}

const pkgNameByDirCache = new Map<string, string | null>();

/**
 * 从目录向上查找最近的 package.json，返回其 name。
 * 结果按目录缓存（包括沿途访问过的目录），避免重复 IO。
 */
function readPkgNameFromDir(dir: string): string | null {
  const cached = pkgNameByDirCache.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  const visited: string[] = [];
  let current = dir;
  let result: string | null = null;
  const root = path.parse(current).root;

  while (current && current !== root) {
    const cachedCurrent = pkgNameByDirCache.get(current);
    if (cachedCurrent !== undefined) {
      result = cachedCurrent;
      break;
    }

    visited.push(current);
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const json = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        result = typeof json.name === 'string' ? json.name : null;
      } catch {
        result = null;
      }
      break;
    }

    current = path.dirname(current);
  }

  visited.forEach((v) => pkgNameByDirCache.set(v, result));
  pkgNameByDirCache.set(dir, result);
  return result;
}

/**
 * 解析模块路径对应的真实包名。
 *
 * 通过读取最近的 package.json 的 `name` 得到，这是与包管理器/目录结构完全无关的通用方式，
 * 天然适配 npm / pnpm / yarn / workspace 软链，不依赖也不特判 `node_modules`、`.pnpm` 等任何约定。
 *
 * 无法确定（虚拟模块、非绝对路径、缺少 package.json）时返回 null。
 */
export function extractPkgName(modulePath: string): string | null {
  if (!modulePath || !path.isAbsolute(modulePath)) {
    return null;
  }
  return readPkgNameFromDir(path.dirname(modulePath));
}

/**
 * 定位某个包的 package.json 绝对路径。
 * 优先直接解析 `${pkg}/package.json`，若该包通过 exports 限制了 package.json 的导出，
 * 则回退到解析包主入口后向上查找 name 匹配的 package.json。
 */
function resolvePackageJson(pkgName: string, resolveFrom: string): string | null {
  try {
    return require.resolve(`${pkgName}/package.json`, { paths: [resolveFrom] });
  } catch {
    // fallthrough
  }

  try {
    const mainEntry = require.resolve(pkgName, { paths: [resolveFrom] });
    let dir = path.dirname(mainEntry);
    const root = path.parse(dir).root;
    while (dir && dir !== root) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        try {
          const json = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
          if (json.name === pkgName) {
            return candidate;
          }
        } catch {
          // ignore malformed package.json
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    // package not resolvable
  }

  return null;
}

/**
 * 读取某个包 package.json 中的运行时依赖（dependencies + 非可选 peerDependencies）。
 *
 * 排除 `peerDependenciesMeta` 中标记为 `optional: true` 的 peer，
 * 避免把可选集成（如 vue-router 可选依赖 pinia）误判为真实依赖。
 */
function getPackageDependencies(pkgName: string, resolveFrom: string): string[] {
  const pkgJsonPath = resolvePackageJson(pkgName, resolveFrom);
  if (!pkgJsonPath) {
    return [];
  }
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const deps: Record<string, string> = { ...(pkgJson.dependencies || {}), ...(pkgJson.peerDependencies || {}) };
    const peerMeta: Record<string, { optional?: boolean }> = pkgJson.peerDependenciesMeta || {};
    for (const name of Object.keys(deps)) {
      if (peerMeta[name]?.optional) {
        delete deps[name];
      }
    }
    return Object.keys(deps);
  } catch {
    return [];
  }
}

/**
 * 计算某个包的完整依赖闭包（dependencies + peerDependencies，递归）。
 * 解析失败的包计为叶子节点。
 */
function getPackageClosure(pkgName: string, resolveFrom: string): Set<string> {
  const visited = new Set<string>();
  const queue = [pkgName];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    getPackageDependencies(current, resolveFrom).forEach((dep) => {
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    });
  }

  return visited;
}

const sharedPackageMapCache = new Map<string, Map<string, string>>();

/**
 * 构建“真实包名 -> 共享依赖名称”的映射。
 *
 * 对每个共享依赖，基于其 package.json 的依赖闭包，把闭包内的所有包都归属到该共享依赖，
 * 因此无需硬编码任何具体包名。例如 shared.vue 的闭包包含 @vue/runtime-dom、@vue/shared 等，
 * 这些包的模块会自动归属到 vue。
 *
 * @param sharedKeys 共享依赖名称（真实包名）
 * @param resolveFrom 解析依赖的起始目录，默认为 cwd
 */
export function buildSharedPackageMap(
  sharedKeys: string[],
  resolveFrom: string = process.cwd()
): Map<string, string> {
  const cacheKey = `${resolveFrom}::${[...sharedKeys].sort().join(',')}`;
  const cached = sharedPackageMapCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const map = new Map<string, string>();

  // 共享依赖自身始终映射到自己（精确匹配优先）
  sharedKeys.forEach((key) => map.set(key, key));

  sharedKeys.forEach((key) => {
    getPackageClosure(key, resolveFrom).forEach((dep) => {
      if (!map.has(dep)) {
        map.set(dep, key);
      }
    });
  });

  sharedPackageMapCache.set(cacheKey, map);
  return map;
}
