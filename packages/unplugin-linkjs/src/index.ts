import { createUnplugin } from 'unplugin';
import type { Node, ImportDeclaration } from 'oxc-parser';
import MagicString from 'magic-string';

import type { ManifestJson, UnpluginLinkjsOptions } from './types';
import { generateManifestFile, updateManifestFile } from './build-manifest';
import { generateDependencyGraph, analyzeDependencies, extractPkgName, buildSharedPackageMap } from './dependency-graph';
import { generateSharedEntryFile } from './build-shared';
import path from 'path';

export type { ManifestJson, UnpluginLinkjsOptions };

type TransformMode = 'build' | 'dev';

export const unpluginLinkjs = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const {
    extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.d.ts', '.mjs', '.cjs'],
    shared = {},
    isReplaceLinkjs = true,
    adaptiveRuntime = [],
  } = options;
  const sharedPkgs = Object.keys(shared);
  // 真实包名 -> 共享依赖名称（例如 @vue/runtime-dom -> vue）
  const sharedPkgMap = buildSharedPackageMap(sharedPkgs);
  const entry: Record<string, string> = {};
  let shareVarIndex = 0;

  // 依赖图
  const dependencyGraph = new Map<string, Set<string>>();
  // 模块导入依赖
  const moduleImports = new Map<string, Set<string>>();
  // 共享依赖
  const sharedDeps: Record<string, string[]> = {};
  // 入口通过 shared() 声明的共享依赖
  const entrySharedDeps = new Set<string>();

  /**
   * 共享依赖 import 重写。
   *
   * - build：共享产物内部用 `loadShare`（异步、带优先级），其余（宿主/入口/业务模块）用同步 `getShare`；
   * - dev：子应用以模块方式被宿主加载，宿主不一定预加载，因此统一用 `await loadShare`，
   *   这样 hosted 时命中宿主已加载实例（同一个 Vue），standalone 时回退到本地注册的版本。
   */
  const createTransform = (mode: TransformMode) =>
    function transform(this: any, code: string, id: string, _meta?: any) {
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
      // 是否在入口里调用了 expose（用于注入自接受边界，避免入口变更整页刷新）
      let hasExposeCall = false;

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

        // dev 下保留 linkjs import，确保运行时（含 $linkjs 全局）被正确初始化；
        // build 下替换为全局 $linkjs，避免把运行时代码打进产物。
        const isLinkjs = source === 'linkjs' && isReplaceLinkjs && mode === 'build';
        const isAdaptive = adaptiveRuntime.includes(source);
        const isSharedPkg = sharedPkgs.includes(source) || isAdaptive;

        if (!isLinkjs && !isSharedPkg) {
          return;
        }

        if (node.specifiers.length === 0) {
          return;
        }

        // linkjs 运行时方法从全局 $linkjs 上取
        if (isLinkjs) {
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

          magicString.overwrite(node.start, node.end, `const { ${importSpecifiers} } = $linkjs;`);
          hasModifications = true;
          return;
        }

        // 当前模块是否属于某个共享依赖（即被打包为独立共享产物的模块）。
        // 共享依赖内部、以及 dev 模式下的子应用模块，都需要异步加载共享依赖；
        // build 模式下的业务/入口模块由宿主预加载，使用同步 getShare。
        const ownerPkg = extractPkgName(id);
        const ownerShared = ownerPkg ? sharedPkgMap.get(ownerPkg) : undefined;
        const sourceShared = sharedPkgMap.get(source);
        const insideSharedDep = ownerShared !== undefined && ownerShared !== sourceShared;
        const useLoadShare = insideSharedDep || mode === 'dev';
        const useAwait = isAdaptive || useLoadShare;
        // 路线 B：框架级依赖走自适应 runtime（宿主 DEV 复用共享，宿主 PROD 用本地）。
        const accessor = isAdaptive
          ? `$linkjs.loadRuntime(${JSON.stringify(source)}, () => import(${JSON.stringify(source)}))`
          : `$linkjs.${useLoadShare ? 'loadShare' : 'getShare'}(${JSON.stringify(source)})`;
        const awaitPrefix = useAwait ? 'await ' : '';

        const named: string[] = [];
        let namespaceVar: string | null = null;
        let defaultVar: string | null = null;
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
            const local = spec.local.name;
            named.push(imported === local ? local : `${imported}: ${local}`);
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            namespaceVar = spec.local.name;
          } else if (spec.type === 'ImportDefaultSpecifier') {
            defaultVar = spec.local.name;
          }
        }

        const lines: string[] = [];
        if (namespaceVar) {
          lines.push(`const ${namespaceVar} = ${awaitPrefix}${accessor};`);
        } else if (defaultVar && named.length === 0) {
          lines.push(`const ${defaultVar} = (${awaitPrefix}${accessor}).default;`);
        } else {
          const bindings = [...(defaultVar ? [`default: ${defaultVar}`] : []), ...named];
          if (useAwait) {
            const tmp = `__linkjs_share_${shareVarIndex++}`;
            lines.push(`const ${tmp} = await ${accessor};`);
            lines.push(`const { ${bindings.join(', ')} } = ${tmp};`);
          } else {
            lines.push(`const { ${bindings.join(', ')} } = ${accessor};`);
          }
        }

        if (lines.length === 0) {
          return;
        }

        magicString.overwrite(node.start, node.end, lines.join('\n'));
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
          // 入口调用 expose：标记，后续注入自接受边界
          if (node.callee.type === 'Identifier' && node.callee.name === 'expose') {
            hasExposeCall = true;
          }
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
                    // 记录入口声明的共享依赖
                    entrySharedDeps.add(depName);
                    // 初始化依赖数组
                    if (!sharedDeps[depName]) {
                      sharedDeps[depName] = [];
                    }
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
          node.declarations.forEach((decl) => {
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
          node.declarations.forEach((decl) => {
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

      // 入口自接受：入口变更时重跑顶层 expose()（→ 广播 REMOTE_UPDATE），
      // 而不是冒泡成整页刷新。宿主据此重挂载/重解析。
      if (mode === 'dev' && hasExposeCall) {
        magicString.prepend(`if (import.meta.hot) { import.meta.hot.accept(); }\n`);
        hasModifications = true;
      }

      if (!hasModifications) {
        return null;
      }

      return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true }),
      };
    };

  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    vite: {
      transform: createTransform('dev'),
    },

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

        // 自动分析共享依赖之间的子依赖关系（基于 package.json 依赖闭包）
        const analyzedSharedDeps = analyzeDependencies(shared);
        generateManifestFile(outDir, exposes, shared, analyzedSharedDeps);

        const isDeclarationFile = (key: string) => /\.d\.(ts|mts|cts)$/.test(key);
        bundleKeys.forEach((key) => {
          const bundleItem = bundle[key];
          if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
            if (isDeclarationFile(key)) {
              if (!entry.types) entry.types = path.join(baseDir, key);
            } else if (!entry.js) {
              entry.js = path.join(baseDir, key);
            }
          } else if (bundleItem.type === 'asset') {
            if (key.endsWith('.map')) {
              return;
            }
            if (key.endsWith('.css')) {
              if (!entry.css) entry.css = path.join(baseDir, key);
            } else if (key.endsWith('.html')) {
              if (!entry.html) entry.html = path.join(baseDir, key);
            }
          }
        });

        // 生成共享依赖入口文件（shared.js），供宿主在加载主入口前预加载远程提供的共享依赖
        const sharedEntry = generateSharedEntryFile({ outDir, baseDir, shared, bundle, sharedPkgMap });
        if (sharedEntry) {
          entry.shared = sharedEntry;
        }

        // 入口声明的共享依赖（来自 shared() 调用）
        const dependencies = Array.from(entrySharedDeps).filter((dep) => dep in analyzedSharedDeps);

        updateManifestFile(outDir, { entry, dependencies }, analyzedSharedDeps);

        // 生成依赖拓扑图（含共享依赖的子共享依赖）
        generateDependencyGraph(outDir, dependencyGraph, bundle, analyzedSharedDeps, dependencies);
      },
      transform: createTransform('build'),
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
export { createCssScopePlugin, scopeSelector, LINKJS_SCOPE_ATTR } from './css-scope';
export default unpluginLinkjs;
