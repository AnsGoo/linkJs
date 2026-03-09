import * as fs from 'fs';
import * as path from 'path';

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
  sharedDeps: Record<string, string[]> = {}
) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 生成文本格式的依赖图
  const textGraph = generateTextGraph(dependencyGraph, sharedDeps);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.txt'), textGraph, 'utf-8');

  // 生成JSON格式的依赖图
  const jsonGraph = generateJsonGraph(dependencyGraph, sharedDeps);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.json'), JSON.stringify(jsonGraph, null, 2), 'utf-8');

  // 生成Mermaid格式的依赖图（用于可视化）
  const mermaidGraph = generateMermaidGraph(dependencyGraph, sharedDeps);
  fs.writeFileSync(path.join(outDir, 'dependency-graph.mmd'), mermaidGraph, 'utf-8');
}

/**
 * 生成文本格式的依赖图
 */
function generateTextGraph(
  dependencyGraph: Map<string, Set<string>>,
  sharedDeps: Record<string, string[]>
): string {
  let textGraph = '=== Dependency Graph ===\n\n';

  // 只处理 entry 文件和相关依赖
  const entryModules = identifyEntryModules(dependencyGraph);

  // 分析入口文件和共享依赖之间的依赖关系
  entryModules.forEach(moduleId => {
    const moduleName = path.basename(moduleId);
    textGraph += `${moduleName}\n`;

    // 基于 shared 函数中配置的依赖，分析入口文件和共享依赖之间的依赖关系
    // 只显示根共享依赖（如 vue），不显示其他共享依赖（如 vue-router 和 pinia）
    const collectedSharedDeps = collectRootSharedDeps(sharedDeps);

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
  sharedDeps: Record<string, string[]>
) {
  const entryModules = identifyEntryModules(dependencyGraph);
  const jsonGraph: Record<string, string[]> = {};

  entryModules.forEach(moduleId => {
    const collectedSharedDeps = collectRootSharedDeps(sharedDeps);
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
  sharedDeps: Record<string, string[]>
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

  // 基于 shared 函数中配置的依赖，分析入口文件和共享依赖之间的依赖关系
  const entryToSharedDeps: Record<string, Set<string>> = {};
  entryModules.forEach(moduleId => {
    entryToSharedDeps[moduleId] = collectRootSharedDeps(sharedDeps);
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
 * 收集根共享依赖（没有依赖的依赖）
 */
function collectRootSharedDeps(sharedDeps: Record<string, string[]>): Set<string> {
  const collectedSharedDeps = new Set<string>();

  Object.keys(sharedDeps).forEach(sharedDep => {
    if (sharedDeps[sharedDep].length === 0) {
      collectedSharedDeps.add(sharedDep);
    }
  });

  return collectedSharedDeps;
}

/**
 * 自动分析依赖关系
 * @param dependencyGraph 依赖图
 * @param shared 共享依赖配置
 * @returns 共享依赖关系
 */
export function analyzeDependencies(
  dependencyGraph: Map<string, Set<string>>,
  shared: Record<string, any>
): Record<string, string[]> {
  const sharedDeps: Record<string, string[]> = {};
  const sharedKeys = Object.keys(shared);

  // 初始化 sharedDeps
  sharedKeys.forEach(key => {
    sharedDeps[key] = [];
  });

  // 打印调试信息
  console.log('=== Analyzing Dependencies ===');
  console.log('Shared keys:', sharedKeys);
  console.log('Dependency graph entries:', dependencyGraph.size);

  // 分析每个共享依赖
  sharedKeys.forEach(sharedDep => {
    console.log(`\nAnalyzing ${sharedDep}:`);

    // 检查其他共享依赖是否依赖于当前共享依赖
    sharedKeys.forEach(otherDep => {
      if (sharedDep === otherDep) {
        return;
      }

      // 遍历依赖图，找到属于 otherDep 的模块
      let hasDep = false;
      dependencyGraph.forEach((deps, moduleId) => {
        if (isSharedDep(moduleId, otherDep, sharedKeys)) {
          console.log(`  Checking module: ${moduleId}`);
          if (hasDependencyOn(moduleId, sharedDep, dependencyGraph, sharedKeys)) {
            console.log(`  -> ${otherDep} depends on ${sharedDep}`);
            hasDep = true;
          }
        }
      });

      if (hasDep && !sharedDeps[otherDep].includes(sharedDep)) {
        sharedDeps[otherDep].push(sharedDep);
      }
    });
  });

  console.log('=== Result ===');
  console.log('Shared deps:', sharedDeps);

  return sharedDeps;
}

/**
 * 从路径中提取包名
 */
function extractPkgName(modulePath: string): string | null {
  // 处理 pnpm 的路径格式：.pnpm/xxx@version/node_modules/xxx/...
  // 或者 .pnpm/@vue+devtools-api@version/node_modules/@vue/devtools-api/...
  // 注意：pnpm 使用 + 替代 /，所以 @vue+devtools-api 代表 @vue/devtools-api

  // 匹配 .pnpm/xxx@version/node_modules/xxx
  // 或者 .pnpm/@vue+devtools-api@version/node_modules/@vue/devtools-api
  // 或者 .pnpm/pinia@3.0.4_typescript@5.9.3_vue@3.5.27_typescript@5.9.3_/node_modules/pinia/dist/pinia.mjs
  // 或者 .pnpm/vue-router@5.0.2_@vue+compiler-sfc@3.5.27_pinia@3.0.4_typescript@5.9.3_vue@3.5.27_types_7f1a033688e072c9ca94d78ef4f964d2/node_modules/vue-router/dist/vue-router.mjs
  const pnpmMatch = modulePath.match(/\.pnpm\/([^/]+)\/node_modules\/([^/]+)(?:\/([^/]+))?/);
  if (pnpmMatch) {
    // 从 node_modules 后面提取包名
    const nodeModulesPkgName = pnpmMatch[2];
    // 检查是否是 scoped 包（如 @vue/devtools-api）
    if (nodeModulesPkgName === '@vue' && pnpmMatch[3]) {
      return `${nodeModulesPkgName}/${pnpmMatch[3]}`;
    }
    return nodeModulesPkgName;
  }

  // 处理普通格式：node_modules/@vue/xxx/...
  const match = modulePath.match(/node_modules\/(@[^/]+\/[^/]+)\//);
  if (match) {
    return match[1];
  }
  // 处理普通格式：node_modules/xxx/...
  const match2 = modulePath.match(/node_modules\/([^/]+)(\/|$)/);
  if (match2) {
    return match2[1];
  }
  return null;
}

/**
 * 检查模块是否是指定的共享依赖
 */
function isSharedDep(modulePath: string, sharedDep: string, sharedKeys: string[]): boolean {
  const pkgName = extractPkgName(modulePath);
  if (!pkgName) {
    return false;
  }
  // 对于 @vue/ 前缀的包
  if (pkgName.startsWith('@vue/')) {
    return sharedDep === 'vue';
  }
  return pkgName === sharedDep;
}

/**
 * 从模块路径中获取导入的包名
 */
function getImportedPkgName(modulePath: string): string | null {
  // 从路径中提取包名
  const pkgName = extractPkgName(modulePath);
  if (!pkgName) {
    return null;
  }
  // 对于 @vue/ 前缀的包，视为 vue
  if (pkgName.startsWith('@vue/')) {
    return 'vue';
  }
  return pkgName;
}

/**
 * 检查模块是否直接或间接依赖于指定的共享依赖
 */
function hasDependencyOn(
  modulePath: string,
  targetDep: string,
  dependencyGraph: Map<string, Set<string>>,
  sharedKeys: string[]
): boolean {
  const visited = new Set<string>();

  const checkDependency = (currentPath: string): boolean => {
    if (visited.has(currentPath)) {
      return false;
    }
    visited.add(currentPath);

    const deps = dependencyGraph.get(currentPath);
    if (!deps) {
      return false;
    }

    for (const dep of deps) {
      const importedPkg = getImportedPkgName(dep);
      if (importedPkg === targetDep) {
        return true;
      }
      if (checkDependency(dep)) {
        return true;
      }
    }

    return false;
  };

  return checkDependency(modulePath);
}
