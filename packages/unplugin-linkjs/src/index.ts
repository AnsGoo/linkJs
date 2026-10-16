import { createUnplugin } from 'unplugin';
import type { Node, ImportDeclaration } from 'oxc-parser';
import MagicString from 'magic-string';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import type { ManifestAsset, ManifestJson, UnpluginLinkjsOptions } from './types.js';
import { consumeRemoteTypes, type ConsumeTypesResult } from './consume-types.js';
import { watchRemoteTypes, type TypeWatcher } from './type-watcher.js';
import { generateManifestFile, updateManifestFile } from './build-manifest.js';
import { generateDependencyGraph, analyzeDependencies, extractPkgName, buildSharedPackageMap } from './dependency-graph.js';
import { generateSharedEntryFile } from './build-shared.js';
import { REMOTE_VIRTUAL_PREFIX, renderRemoteImport, toRemoteImportId, type RemoteImportRegistry } from './remote-imports.js';
import { buildRuntimeBootstrap, PRELOAD_GLOBAL, REMOTE_HOSTS_GLOBAL, selectRemoteImportNames } from './runtime-bootstrap.js';
import { findCyclicComponents } from './remote-dep-graph.js';
import { resolveExposeSources } from './expose-parse.js';
import { linkjsVue, linkjsVueOptions } from './vue-plugin.js';
import path from 'path';

export type {
  ManifestJson,
  UnpluginLinkjsOptions,
  RemoteTypeTarget,
  RemotePreloadOptions,
  RemoteImportsOptions,
  ConsumeTypesOptions,
  ConsumeTypesAuth,
} from './types.js';
export { consumeRemoteTypes, renderRemoteTypeDeclarations } from './consume-types.js';
export type { RemoteTypeInfo, ConsumeTypesResult } from './consume-types.js';
export { watchRemoteTypes, parseSseChunk } from './type-watcher.js';

type TransformMode = 'build' | 'dev';

const unpluginLinkjsBase = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const {
    extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.d.ts', '.mjs', '.cjs'],
    shared = {},
    isReplaceLinkjs = true,
    adaptiveRuntime = [],
    shareScope,
    publicPath,
    mode = 'production',
    consumeTypes,
    remoteImports,
    remotes: declaredRemotes,
  } = options;

  /** 远程 manifest 的基址目录（用于派生依赖 host，保留子路径，使 `${host}/manifest.json` 可回指）。 */
  function manifestBaseOf(url: string | undefined): string | undefined {
    if (!url) {
      return undefined;
    }
    try {
      return new URL('.', url).href;
    } catch {
      return undefined;
    }
  }

  /** 读取本项目 package.json 的 name（作为本地依赖图的根；读不到则返回 undefined）。 */
  function localPackageName(): string | undefined {
    try {
      const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
      return typeof pkg.name === 'string' && pkg.name ? pkg.name : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 解析写入 manifest 的远程依赖：
   * - 从 `consumeTypes.remotes` 派生（`{ host }`，host 取显式 host 或 manifestUrl 的 origin）；
   * - 由 `options.remotes` 覆盖/补充。
   */
  function resolveManifestRemotes(): ManifestJson['remotes'] | undefined {
    const derived: NonNullable<ManifestJson['remotes']> = {};
    for (const target of consumeTypes?.remotes ?? []) {
      const host = target.host ?? manifestBaseOf(target.manifestUrl);
      derived[target.name] = host ? { host } : {};
    }
    const merged = { ...derived, ...declaredRemotes };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  // ---- consumeTypes（宿主类型转发）运行时状态 ----
  let isServe = false;
  let typeWatcher: TypeWatcher | undefined;
  let typeRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  // ---- remoteImports（`import { X } from '<remote>'` 运行时虚拟模块）----
  const remoteImportsEnabled = remoteImports !== false;
  const remoteImportsShadow = typeof remoteImports === 'object' && remoteImports ? remoteImports.shadow === true : false;
  const remoteImportRegistry: RemoteImportRegistry = new Map();

  // ---- consumeTypes 就绪等待：虚拟模块的 load 可能早于 consumeTypes 完成（启动/扫描竞态）----
  let consumeWaiters: Array<{ name: string; resolve: () => void }> = [];

  /** consumeTypes 刷新后唤醒已就绪的等待者（registry 已含对应 remote）。 */
  function notifyConsumeWaiters(): void {
    if (consumeWaiters.length === 0) {
      return;
    }
    const pending: typeof consumeWaiters = [];
    for (const waiter of consumeWaiters) {
      if (remoteImportRegistry.has(waiter.name)) {
        waiter.resolve();
      } else {
        pending.push(waiter);
      }
    }
    consumeWaiters = pending;
  }

  /** 等待某个 remote 进入注册表；超时后返回，由调用方决定如何降级。 */
  function waitForRemote(name: string, timeoutMs: number): Promise<void> {
    if (remoteImportRegistry.has(name)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      consumeWaiters.push({ name, resolve: finish });
    });
  }

  /**
   * 允许 `import { X } from '<remote>'` 语法的远程名集合。
   * 只有声明了 `preload`（构建期注入预加载）的 remote 才支持；未声明的按 lazy 处理，
   * 只能用运行时的 `loadRemote` / `loadLib` 主动加载。
   */
  function eligibleImportNames(): Set<string> {
    return new Set(selectRemoteImportNames(consumeTypes?.remotes));
  }

  /** 用最新 consumeTypes 结果刷新远程注册表（dev 下类型刷新时同步更新 exposes）。 */
  function syncRemoteImports(result?: ConsumeTypesResult): void {
    remoteImportRegistry.clear();
    if (!remoteImportsEnabled || !result) {
      return;
    }
    const eligible = eligibleImportNames();
    for (const info of result.remotes) {
      if (!eligible.has(info.name)) {
        continue;
      }
      remoteImportRegistry.set(info.name, { name: info.name, host: info.host, exposes: info.exposes });
    }
    notifyConsumeWaiters();
  }

  /**
   * 本项目自身声明的远程依赖图：以本项目名为根、指向写入 manifest 的 `remotes` 各项；
   * **不递归下游**（各远程的依赖由其各自的构建负责）。
   */
  function localRemoteGraph(): Record<string, string[]> {
    const declared = Object.keys(resolveManifestRemotes() ?? {});
    const graph: Record<string, string[]> = {};
    const self = localPackageName();
    if (self) {
      graph[self] = declared;
    }
    for (const name of declared) {
      if (!graph[name]) {
        graph[name] = [];
      }
    }
    return graph;
  }

  /**
   * 构建期循环依赖检测：仅针对**本项目自身声明**的依赖图。
   *
   * - shared 图：`analyzeDependencies(shared)`（本地 package.json 闭包推导）；
   * - remote 图：本项目声明的远程依赖（`remotes`），以本项目为根。
   *
   * 不再**传递拉取**下游 remote 的 manifest —— 每个部分管好自己：各远程的依赖由各自的构建校验。
   * 需要显式做跨远程体检时，用 `linkjs-check` CLI（`pnpm check:cycles`）。
   *
   * 输出**强连通分量（SCC）**；`mode==='build'` 时抛错阻断，dev 仅告警。
   */
  async function checkDependencyCycles(mode: 'build' | 'dev'): Promise<void> {
    const sharedScc = findCyclicComponents(analyzeDependencies(shared));
    const remoteScc = findCyclicComponents(localRemoteGraph());
    if (sharedScc.length === 0 && remoteScc.length === 0) {
      return;
    }
    const fmtScc = (comps: string[][]) => comps.map((c) => `  { ${c.join(', ')} }`).join('\n');
    const lines: string[] = [];
    if (remoteScc.length > 0) {
      lines.push(`[linkjs] 远程依赖环（需并载的强连通分量）：\n${fmtScc(remoteScc)}`);
    }
    if (sharedScc.length > 0) {
      lines.push(`[linkjs] 共享依赖环（需并载的强连通分量）：\n${fmtScc(sharedScc)}`);
    }
    const message = `${lines.join('\n')}\n（循环依赖会导致加载死锁，请拆分或抽第三模块打破环。详见 docs/remote-dependency-cycles.md）`;
    if (mode === 'build') {
      throw new Error(message);
    }
    console.error(message);
  }

  let consumeRetry = 0;
  let consumeInFlight: Promise<ConsumeTypesResult | undefined> | undefined;

  /**
   * 有限次退避重试。
   * `consumeRemoteTypes` 对单个 remote 失败是**内部吞掉**的（保留旧缓存并 warn），
   * 因此“调用未抛错”不等于“全部 remote 已解析”，需要按 registry 实际结果决定是否重试。
   */
  function scheduleConsumeRetry(): void {
    if (consumeRetry >= 3) {
      consumeRetry = 0;
      return;
    }
    consumeRetry += 1;
    setTimeout(() => void runConsumeTypes(), 1500 * consumeRetry);
  }

  async function consumeAttempt(): Promise<ConsumeTypesResult | undefined> {
    if (!consumeTypes?.remotes?.length) {
      return undefined;
    }
    try {
      const result = await consumeRemoteTypes(consumeTypes);
      syncRemoteImports(result);
      const missing = [...eligibleImportNames()].some((name) => !remoteImportRegistry.has(name));
      if (missing) {
        scheduleConsumeRetry();
      } else {
        consumeRetry = 0;
      }
      return result;
    } catch (error) {
      console.warn(`[linkjs] consumeTypes failed: ${String((error as { message?: string })?.message ?? error)}`);
      // 远端可能尚未启动：有限次退避重试，避免虚拟模块因 registry 为空而失效。
      scheduleConsumeRetry();
      return undefined;
    }
  }

  /** 并发触发（configureServer / 虚拟模块 load / typeWatcher）时去重，只跑一次。 */
  function runConsumeTypes(): Promise<ConsumeTypesResult | undefined> {
    if (consumeInFlight) {
      return consumeInFlight;
    }
    consumeInFlight = consumeAttempt();
    void consumeInFlight.finally(() => {
      consumeInFlight = undefined;
    });
    return consumeInFlight;
  }

  function startTypeWatchers(result: ConsumeTypesResult): void {
    if (consumeTypes?.watch === false) {
      return;
    }
    const devRemotes = result.remotes.filter((info) => info.mode === 'development');
    if (devRemotes.length === 0) {
      return;
    }
    typeWatcher?.close();
    typeWatcher = watchRemoteTypes(devRemotes, consumeTypes!, () => {
      // 去抖合并：连续事件只刷新一次
      if (typeRefreshTimer) {
        clearTimeout(typeRefreshTimer);
      }
      typeRefreshTimer = setTimeout(() => void runConsumeTypes(), 150);
    });
  }
  const sharedPkgs = Object.keys(shared);
  // 真实包名 -> 共享依赖名称（例如 @vue/runtime-dom -> vue）
  const sharedPkgMap = buildSharedPackageMap(sharedPkgs);
  const entry: Record<string, any> = {};
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
   * 解析 `expose('<remote>', { Name: <module> })` 得到的 **expose 名 → 模块** 映射。
   * 用于把 manifest 的 `exposes[].name` 设为 expose 名，并按其模块闭包补全 `deps`。
   */
  const exposeRegistry = new Map<string, { file: string; source?: string }>();

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

        // 按需加载：共享依赖一律异步 `await loadShare`（宿主**不再**预加载共享），
        // 由“用到才拿”触发；框架级依赖（adaptiveRuntime）仍走 `loadRuntime`。
        const useLoadShare = true;
        const useAwait = true;
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
          // 入口调用 expose：标记
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

      // 解析 expose 名 → 源模块（供 build 期补全 exposes[].deps）
      for (const [name, source] of resolveExposeSources(ast as any)) {
        exposeRegistry.set(name, { file: id, source });
      }

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

    // `import { X } from '<remote>'`：Vite 下经 alias 命中；rollup/rolldown 下由 resolveId 兜底。
    resolveId(source: string) {
      if (source.startsWith(REMOTE_VIRTUAL_PREFIX)) {
        return source;
      }
      return remoteImportsEnabled ? toRemoteImportId(source, remoteImportRegistry) : null;
    },
    async load(id: string) {
      const rendered = remoteImportsEnabled ? renderRemoteImport(id, remoteImportRegistry, { shadow: remoteImportsShadow }) : null;
      if (rendered != null || !id.startsWith(REMOTE_VIRTUAL_PREFIX)) {
        return rendered;
      }
      // 虚拟模块已解析、但 registry 尚未就绪（consumeTypes 与首次 load 竞态）。
      // 若直接返回 null，Vite 会把 `\0linkjs-remote:<name>` 当作磁盘路径读取并抛
      // “path ... null bytes”。这里确保拉取已触发并等待该 remote 注册后再渲染。
      if (consumeTypes?.remotes?.length) {
        void runConsumeTypes();
      }
      const name = id.slice(REMOTE_VIRTUAL_PREFIX.length).split('/')[0];
      await waitForRemote(name, Math.max(consumeTypes?.timeout ?? 5000, 5000));
      const ready = renderRemoteImport(id, remoteImportRegistry, { shadow: remoteImportsShadow });
      if (ready != null) {
        return ready;
      }
      throw new Error(
        `[linkjs] remote "${name}" 不可用：consumeTypes 未解析到该 remote 或其 expose。` +
          `请确认 manifestUrl/host 可达，且该 expose 已在远端声明。`,
      );
    },

    vite: {
      config() {
        if (!remoteImportsEnabled) {
          return;
        }
        // 只有声明 preload 的 remote 支持 import 语法；lazy 的走运行时 loadRemote。
        const names = selectRemoteImportNames(consumeTypes?.remotes);
        if (names.length === 0) {
          return;
        }
        return {
          // 裸包名 -> 虚拟模块，避免 Vite 预构建/包解析阶段把 `<remote>` 当真实依赖。
          resolve: {
            alias: names.map((name) => ({ find: name, replacement: REMOTE_VIRTUAL_PREFIX + name })),
          },
          optimizeDeps: { exclude: names },
        };
      },
      // 构建期注入运行时引导：
      // - `__linkjs_remote_hosts__`：远程名 -> 运行时基址（loadApp/createRemoteApp 等省略 host）；
      // - `__linkjs_preload__`：需要自动预加载的远程（等价于 main 里手动 preloadRemote）。
      transformIndexHtml() {
        const { hosts, preloads } = buildRuntimeBootstrap(consumeTypes?.remotes);
        const tags: { tag: string; injectTo: 'head-prepend'; children: string }[] = [];
        if (Object.keys(hosts).length > 0) {
          tags.push({
            tag: 'script',
            injectTo: 'head-prepend',
            children: `globalThis.${REMOTE_HOSTS_GLOBAL}=${JSON.stringify(hosts)};`,
          });
        }
        if (preloads.length > 0) {
          tags.push({
            tag: 'script',
            injectTo: 'head-prepend',
            children: `globalThis.${PRELOAD_GLOBAL}=${JSON.stringify(preloads)};`,
          });
        }
        return tags.length > 0 ? tags : undefined;
      },
      transform: createTransform('dev'),
      configResolved(config: { command?: string }) {
        isServe = config.command === 'serve';
      },
      // dev 由 configureServer 处理（初始对齐 + 订阅）；build 在此一次性对齐。
      async buildStart() {
        if (!isServe) {
          await runConsumeTypes();
          await checkDependencyCycles('build');
        }
      },
      async configureServer(server: any) {
        // 原样返回 `.d.ts`：Vite 的 transform 会把声明文件编译成 `export {}`，
        // 导致宿主 consumeTypes 拉到空类型。声明文件不参与运行时，直接按文本返回。
        server.middlewares.use((req: any, res: any, next: any) => {
          const url = String(req.url || '').split('?')[0];
          if (!/\.d\.(ts|mts|cts)$/.test(url)) {
            return next();
          }
          const root = server.config?.root || process.cwd();
          const file = path.resolve(root, decodeURIComponent(url).replace(/^\//, ''));
          if (!file.startsWith(root)) {
            return next();
          }
          try {
            const content = readFileSync(file, 'utf-8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(content);
          } catch {
            next();
          }
        });
        const result = await runConsumeTypes();
        if (result) {
          startTypeWatchers(result);
        }
        await checkDependencyCycles('dev');
        server.httpServer?.on?.('close', () => {
          typeWatcher?.close();
          if (typeRefreshTimer) {
            clearTimeout(typeRefreshTimer);
          }
        });
      },
    },

    rolldown: {
      async buildStart() {
        await runConsumeTypes();
        await checkDependencyCycles('build');
      },
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
        generateManifestFile(outDir, exposes, shared, analyzedSharedDeps, shareScope, publicPath, mode, resolveManifestRemotes());

        // d.ts 内容哈希（内容寻址 + 宿主类型变更去重）。
        const sha384 = (data: string | Buffer) => `sha384-${createHash('sha384').update(data).digest('base64')}`;

        const isDeclarationFile = (key: string) => /\.d\.(ts|mts|cts)$/.test(key);
        const toManifestPath = (fileName: string) => path.join(baseDir, fileName);
        // 收集某个入口 chunk 的资源清单（js/css 的同步与异步部分）。
        const collectAssets = (item: any): ManifestAsset => {
          const viteMeta = item?.viteMetadata ?? {};
          const filterDts = (list: string[]) => list.filter((f) => f && !isDeclarationFile(f));
          const jsSync = filterDts([item?.fileName, ...(item?.imports ?? [])]);
          const jsAsync = filterDts([...(item?.dynamicImports ?? [])]);
          const cssSync = [...(viteMeta.importedCss ?? [])];
          const cssAsync = [...(viteMeta.importedAsyncCss ?? [])];
          return {
            js: { sync: jsSync.map(toManifestPath), async: jsAsync.map(toManifestPath) },
            css: { sync: cssSync.map(toManifestPath), async: cssAsync.map(toManifestPath) },
          };
        };

        // 计算给定模块集合的依赖闭包（shared + remotes），用于补全 `exposes[].deps`。
        const manifestRemotes = resolveManifestRemotes() ?? {};
        const collectDepsFrom = (startIds: string[]): NonNullable<NonNullable<ManifestJson['exposes']>[number]['deps']> => {
          const sharedSet = new Set<string>();
          const remotes: Record<string, { host?: string }> = {};
          const seen = new Set<string>();
          const queue: string[] = [...startIds];
          while (queue.length > 0) {
            const mid = queue.shift()!;
            if (seen.has(mid)) {
              continue;
            }
            seen.add(mid);
            if (mid.startsWith(REMOTE_VIRTUAL_PREFIX)) {
              const name = mid.slice(REMOTE_VIRTUAL_PREFIX.length).split('/')[0];
              if (name) {
                remotes[name] = manifestRemotes[name] ? { host: manifestRemotes[name].host } : {};
              }
              continue;
            }
            const pkg = extractPkgName(mid);
            if (pkg) {
              const sharedName = sharedPkgMap.get(pkg);
              if (sharedName && shared[sharedName]) {
                sharedSet.add(sharedName);
              }
            }
            // transform 会把 shared/remote 的**裸导入改写掉**（模块图里没有该边），
            // 因此改为读取 transform 期间记录的原始导入。
            for (const dep of moduleImports.get(mid) ?? []) {
              if (manifestRemotes[dep]) {
                remotes[dep] = { host: manifestRemotes[dep].host };
                continue;
              }
              const depShared = sharedPkgMap.get(dep);
              if (depShared && shared[depShared]) {
                sharedSet.add(depShared);
              }
            }
            const info = this.getModuleInfo(mid);
            if (info) {
              // 只沿**本地相对模块**继续遍历（不深入 node_modules 包内部），
              // 避免把依赖包内部的传递依赖（如 pinia→vue）过度计入该 expose。
              const isLocal = (id: string) => !id.includes('/node_modules/') && !id.startsWith('\0');
              queue.push(
                ...((info.importedIds as string[]) ?? []).filter(isLocal),
                ...((info.dynamicallyImportedIds as string[]) ?? []).filter(isLocal),
              );
            }
          }
          return { remotes, shared: [...sharedSet] };
        };
        const collectChunkDeps = (chunk: any) =>
          collectDepsFrom([...((chunk?.moduleIds as string[]) ?? []), ...(chunk?.facadeModuleId ? [chunk.facadeModuleId as string] : [])]);

        const exposeAssets: NonNullable<ManifestJson['exposes']> = [];
        // d.ts 入口路径与内容哈希（供宿主类型转发 / 变更检测）。
        let typesHash: string | undefined;
        const setTypes = (key: string, item: any) => {
          if (entry.types) {
            return;
          }
          entry.types = path.join(baseDir, key);
          const source =
            typeof item?.code === 'string'
              ? item.code
              : typeof item?.source === 'string'
                ? item.source
                : item?.source
                  ? Buffer.from(item.source)
                  : '';
          typesHash = sha384(source);
        };
        // 构建产物里的 CSS 资源（Vite 下 cssCodeSplit:false 通常只有一个）。
        const allCssAssets = bundleKeys.filter((key) => key.endsWith('.css') && !key.endsWith('.map'));
        bundleKeys.forEach((key) => {
          const bundleItem = bundle[key];
          if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
            if (isDeclarationFile(key)) {
              setTypes(key, bundleItem);
            } else {
              if (!entry.js) entry.js = path.join(baseDir, key);
              const assets = collectAssets(bundleItem);
              if (!entry.assets) entry.assets = assets;
              // 回退：未解析到 expose() 映射时，按入口 chunk 生成 exposes 项。
              if (exposeRegistry.size === 0) {
                exposeAssets.push({
                  name: (bundleItem as any).name || key,
                  path: path.join(baseDir, key),
                  assets,
                  deps: collectChunkDeps(bundleItem),
                });
              }
            }
          } else if (bundleItem.type === 'asset') {
            if (key.endsWith('.map')) {
              return;
            }
            if (key.endsWith('.css')) {
              if (!entry.css) entry.css = path.join(baseDir, key);
            } else if (key.endsWith('.html')) {
              if (!entry.html) entry.html = path.join(baseDir, key);
            } else if (isDeclarationFile(key)) {
              setTypes(key, bundleItem);
            }
          }
        });

        // 依据 `expose()` 解析结果生成 exposes[]：name = expose 名，deps = 该模块闭包。
        if (exposeRegistry.size > 0) {
          const allIds = Array.from(this.getModuleIds(), (m) => String(m));
          for (const [name, info] of exposeRegistry) {
            const candidate = info.source ? path.resolve(path.dirname(info.file), info.source) : info.file;
            const startId = allIds.find((m) => m === candidate) ?? allIds.find((m) => m.startsWith(candidate)) ?? info.file;
            exposeAssets.push({
              name,
              path: entry.js ?? '',
              assets: entry.assets ?? { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
              deps: collectDepsFrom([startId]),
            });
          }
        }

        // 回退：rolldown-vite 未在 chunk 上暴露 importedCss 时，把构建产出的 CSS 归到主入口，
        // 保证 `entry.assets.css.sync` 完整（供 preloadRemote 预加载样式）。
        if (entry.assets && (entry.assets.css?.sync ?? []).length === 0 && allCssAssets.length > 0) {
          const cssAsset = entry.assets.css ?? {};
          entry.assets.css = { ...cssAsset, sync: allCssAssets.map(toManifestPath) };
          const mainExpose = exposeAssets.find((item) => item.path === entry.js);
          if (mainExpose) {
            const exposeCss = mainExpose.assets.css ?? {};
            mainExpose.assets.css = { ...exposeCss, sync: entry.assets.css.sync };
          }
        }

        // 生成共享依赖入口文件（shared.js），供宿主在加载主入口前预加载远程提供的共享依赖
        const sharedEntry = generateSharedEntryFile({ outDir, baseDir, shared, bundle, sharedPkgMap });
        if (sharedEntry) {
          entry.shared = sharedEntry;
        }

        // 入口声明的共享依赖（来自 shared() 调用）
        const dependencies = Array.from(entrySharedDeps).filter((dep) => dep in analyzedSharedDeps);

        // 生成各产物（js/css/html）的 SRI 完整性，写进 manifest 供宿主预加载/校验。
        const integrity: Record<string, string> = {};
        bundleKeys.forEach((key) => {
          if (key.endsWith('.map') || isDeclarationFile(key)) {
            return;
          }
          const item = bundle[key];
          if (item.type === 'chunk') {
            integrity[toManifestPath(key)] = sha384(item.code);
          } else if (item.type === 'asset') {
            const source = typeof item.source === 'string' ? item.source : Buffer.from(item.source);
            integrity[toManifestPath(key)] = sha384(source);
          }
        });

        const metaData: NonNullable<ManifestJson['metaData']> | undefined = entry.types ? { types: entry.types, typesHash } : undefined;
        updateManifestFile(
          outDir,
          { entry, dependencies, exposes: exposeAssets, integrity, metaData, mode, remotes: resolveManifestRemotes() },
          analyzedSharedDeps,
        );

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

/**
 * linkjs 的 unplugin 实例。
 *
 * 额外提供 vue 插件的 scoped-id 增强，避免不同应用相同相对路径的组件 scopeId 冲突：
 * - `unpluginLinkjs.vueOptions(options?)`：**补充**给用户的 `vue(...)` / `VuePlugin(...)`
 *   （推荐，保留原插件调用，只合并 options）；
 * - `unpluginLinkjs.vue()` / `unpluginLinkjs.vue.rolldown()`：drop-in 包装（可选）。
 */
export const unpluginLinkjs = Object.assign(unpluginLinkjsBase, { vue: linkjsVue, vueOptions: linkjsVueOptions });

const unpluginLinkjsRollowPlugin = unpluginLinkjs.rolldown;
export { unpluginLinkjsRollowPlugin };
export { linkjsVue, linkjsVueOptions };
export type { LinkjsVueOptions } from './vue-plugin.js';
export {
  collectRemoteDependencyGraph,
  detectRemoteDependencyCycles,
  findStronglyConnectedComponents,
  findCyclicComponents,
} from './remote-dep-graph.js';
export type { RemoteRoot, CollectGraphOptions } from './remote-dep-graph.js';
export { linkjsSharedVersions, LINKJS_SHARED_VIRTUAL_ID } from './shared-versions.js';
export type { SharedVersionsOptions } from './shared-versions.js';
export default unpluginLinkjs;
