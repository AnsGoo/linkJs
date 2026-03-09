import { createUnplugin } from 'unplugin';
import type { Node, ImportDeclaration } from 'oxc-parser';
import MagicString from 'magic-string';

import type { ManifestJson, UnpluginLinkjsOptions } from './types';
import { generateManifestFile, updateManifestFile } from './build-manifest';
import { generateDependencyGraph, analyzeDependencies } from './dependency-graph';
import path from 'path';

export type { ManifestJson, UnpluginLinkjsOptions };

export const unpluginLinkjs = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const { extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.d.ts','.mjs','.cjs'], shared = {}, isReplaceLinkjs = true } = options;
  const sharedPkgs = Object.keys(shared);
  const entry: Record<string, string> = {};
  let entryFile = '';
  
  // 依赖图
  const dependencyGraph = new Map<string, Set<string>>();
  // 模块导入依赖
  const moduleImports = new Map<string, Set<string>>();
  // 共享依赖
  const sharedDeps: Record<string, string[]> = {};
  
  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    rolldown: {
      buildEnd() {},
      async writeBundle(options, bundle) {
        const moduleIds = this.getModuleIds();
        const exposes: string[] = [];
        for (const moduleId of moduleIds) {
          const module = this.getModuleInfo(moduleId);
          if (module?.isEntry && !moduleId.endsWith('.d.ts')) {
            exposes.push(...(module.exports || []));
          }
        }

        const bundleKeys = Object.keys(bundle);
        const outDir = (this as any).outputOptions?.dir || 'dist';
        const baseDir = outDir.replace(process.cwd(), '');

        // 自动分析依赖关系
        const analyzedSharedDeps = analyzeDependencies(dependencyGraph, shared);
        generateManifestFile(outDir, exposes, shared, analyzedSharedDeps);

        bundleKeys.forEach((key) => {
          const bundleItem = bundle[key];
          if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
            entry[key.endsWith('.d.ts') ? 'types' : 'js'] = path.join(baseDir, key);
          } else if (bundleItem.type === 'asset') {
            entry[key.endsWith('.css') ? 'css' : 'html'] = path.join(baseDir, key);
          }
        });

        // 收集 entry 文件真实用到的 shared 中的依赖
        const dependencies: string[] = [];
        
        // 识别 entry 文件（通常是 lib.ts 或类似名称）
        const entryModules = new Set<string>();
        dependencyGraph.forEach((_, moduleId) => {
          const moduleName = path.basename(moduleId);
          if (moduleName === 'lib.ts' || moduleName.includes('lib') || moduleId.includes('src/lib')) {
            entryModules.add(moduleId);
          }
        });
        
        // 递归分析 entry 文件的依赖，找出真实用到的 shared 依赖
        const findUsedSharedDeps = (moduleId: string, visited: Set<string> = new Set()) => {
          if (visited.has(moduleId)) {
            return;
          }
          visited.add(moduleId);
          
          const deps = dependencyGraph.get(moduleId) || new Set();
          deps.forEach(dep => {
            // 检查是否是 shared 依赖
            // 遍历所有 shared 依赖，检查当前依赖是否包含 shared 依赖的名称
            Object.keys(analyzedSharedDeps).forEach(sharedDep => {
              if (dep.includes(sharedDep)) {
                dependencies.push(sharedDep);
              }
            });
            // 递归分析依赖的依赖
            findUsedSharedDeps(dep, visited);
          });
        };
        
        // 对每个 entry 文件进行分析
        entryModules.forEach(moduleId => {
          findUsedSharedDeps(moduleId);
        });

        updateManifestFile(outDir, { entry, dependencies: Array.from(new Set(dependencies)) }, analyzedSharedDeps);
        
        // 生成依赖拓扑图
        generateDependencyGraph(outDir, dependencyGraph, bundle, analyzedSharedDeps);
      },
      transform(code: string, id: string, meta: any) {
        if (id.includes('css')) {
          return null;
        }

        // 移除文件类型检查，处理所有文件，包括外部依赖
        const isSupportedFile = extensions.some((ext) => id.endsWith(ext));
        if (!isSupportedFile) {
          return null;
        }

        // 检查是否包含共享包或linkjs的导入
        const packagesInCode = sharedPkgs.filter((pkg) => new RegExp(`from\\s+['"]${pkg}['"]`).test(code));
        const hasLinkjsImport = new RegExp(`from\\s+['"]linkjs['"]`).test(code);

        if (packagesInCode.length === 0 && !hasLinkjsImport) {
          return null;
        }

        // 解析AST
        const ast = this.parse(code, {
          sourceType: 'module',
        });

        const magicString = new MagicString(code);
        let hasModifications = false;

        // 转换导入声明
        const transformImportDeclaration = (node: ImportDeclaration) => {
          const source = node.source.value;

          // 收集依赖关系
          if (typeof source === 'string' && !source.startsWith('.') && !source.startsWith('/')) {
            // 提取包名
            const pkgName = source.split('/')[0];
            // 对于 @ 开头的包，需要包含 scoped 名称
            const fullPkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : pkgName;
            // 添加到模块的依赖列表
            if (!moduleImports.has(id)) {
              moduleImports.set(id, new Set<string>());
            }
            moduleImports.get(id)!.add(fullPkgName);
          }

          const isLinkjs = source === 'linkjs' && isReplaceLinkjs;
          const isSharedPkg = sharedPkgs.includes(source);

          if (!isLinkjs && !isSharedPkg) {
            return;
          }

          if (node.specifiers.length === 0) {
            return;
          }

          const importSpecifiers = node.specifiers
            .filter((spec): spec is Extract<typeof spec, { type: 'ImportSpecifier' }> => spec.type === 'ImportSpecifier')
            .map((spec) => {
              const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
              const local = spec.local.name;
              return imported === local ? local : `${imported}: ${local}`;
            })
            .join(', ');

          if (!importSpecifiers) {
            return;
          }

          const newCode = isLinkjs
            ? `const { ${importSpecifiers} } = $linkjs;`
            : `const { ${importSpecifiers} } = $linkjs.getShare('${source}');`;

          magicString.overwrite(node.start, node.end, newCode);
          hasModifications = true;
        };

        // 分析 shared 函数调用
        const analyzeSharedCall = (node: Node) => {
          // 确保节点是一个对象
          if (!node || typeof node !== 'object') {
            return;
          }

          // 检查是否是调用表达式
          if (node.type === 'CallExpression') {
            // 检查是否是 shared 函数调用
            if (node.callee.type === 'Identifier' && node.callee.name === 'shared') {
              // 检查参数数量
              if (node.arguments.length >= 2) {
                const depsArg = node.arguments[1];
                // 检查第二个参数是否是对象表达式
                if (depsArg.type === 'ObjectExpression') {
                  // 遍历对象属性
                  depsArg.properties.forEach((prop) => {
                    if (prop.type === 'Property') {
                      let depName: string;
                      if (prop.key.type === 'Literal') {
                        depName = prop.key.value as string;
                      } else if (prop.key.type === 'Identifier') {
                        depName = prop.key.name;
                      } else {
                        return;
                      }
                      // 初始化依赖数组
                      if (!sharedDeps[depName]) {
                        sharedDeps[depName] = [];
                      }
                      // 自动分析依赖关系
                      // 这里可以通过解析模块的导入语句来确定依赖关系
                      // 暂时保留空数组，后续可以通过构建过程中的依赖分析来填充
                    }
                  });
                }
              }
            }
          }

          // 递归遍历所有子节点
          if ('body' in node && Array.isArray(node.body)) {
            node.body.forEach(analyzeSharedCall);
          }
          if ('expression' in node && node.expression && typeof node.expression === 'object') {
            analyzeSharedCall(node.expression as Node);
          }
          if ('declarations' in node && Array.isArray(node.declarations)) {
            node.declarations.forEach(decl => {
              if (decl && typeof decl === 'object') {
                analyzeSharedCall(decl as Node);
              }
            });
          }
        };

        // 遍历AST
        const walk = (node: Node) => {
          // 确保节点是一个对象
          if (!node || typeof node !== 'object') {
            return;
          }

          if (node.type === 'ImportDeclaration') {
            console.log(node);
            transformImportDeclaration(node);
          }

          // 递归遍历所有子节点
          if ('body' in node && Array.isArray(node.body)) {
            node.body.forEach(walk);
          }
          // 处理其他可能包含导入的节点类型
          if ('expression' in node && node.expression && typeof node.expression === 'object') {
            walk(node.expression as Node);
          }
          if ('declarations' in node && Array.isArray(node.declarations)) {
            node.declarations.forEach(decl => {
              if (decl && typeof decl === 'object') {
                walk(decl as Node);
              }
            });
          }
        };

        // 分析 shared 函数调用
        analyzeSharedCall(ast as any);
        // 遍历AST处理导入
        walk(ast as any);

        if (!hasModifications) {
          return null;
        }

        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true }),
        };
      },
      moduleParsed(moduleInfo) {
        // 收集模块依赖关系
        const moduleId = moduleInfo.id;
        if (!moduleId || moduleId.includes('virtual:') || moduleId.includes('\0')) {
          return;
        }

        const dependencies = new Set<string>();
        if (moduleInfo.importedIds) {
          moduleInfo.importedIds.forEach((importedId) => {
            if (!importedId.includes('virtual:') && !importedId.includes('\0')) {
              dependencies.add(importedId);
            }
          });
        }

        dependencyGraph.set(moduleId, dependencies);
      },
      options(options: any) {
        return options;
      },
    },
  };
});

const unpluginLinkjsRollowPlugin = unpluginLinkjs.rolldown;
export { unpluginLinkjsRollowPlugin };
export default unpluginLinkjs;
