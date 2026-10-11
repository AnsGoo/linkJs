import { getInstance, type RegistryOption } from '..';

/**
 * 运行时插件：在 linkjs 的生命周期节点被调用，用于定制远程加载、共享依赖与入口处理。
 *
 * 支持注册**多个**插件（按注册顺序依次执行）；`before*` 钩子可返回改写后的值以串联。
 * 钩子抛错会被记录并跳过，不影响主流程（`beforeLoadRemote` 的改写同样容错）。
 */
export interface RuntimePlugin {
  name: string;
  /**
   * 插件装载回调：注册时以 linkjs 单例调用，便于插件持有实例/打补丁（Module Federation 的 `apply`）。
   */
  apply?(instance: unknown): void;
  /** `createInstance` 阶段（实例构建前）。 */
  beforeInit?(options: unknown): void;
  /** `createInstance` 阶段（实例构建后）。 */
  afterInit?(instance: unknown): void;

  /** 远程加载前：可返回改写后的 remoteInfo（host/entry/shared 等）。 */
  beforeLoadRemote?(remoteInfo: RegistryOption): RegistryOption | void | Promise<RegistryOption | void>;
  /** 远程信息解析完成（`beforeLoadRemote` 串联之后、真正请求之前）。 */
  afterResolve?(remoteInfo: RegistryOption): void | Promise<void>;
  /** 远程容器（入口应用/库）开始加载。 */
  beforeLoadContainer?(remoteInfo: RegistryOption): void | Promise<void>;
  /** 远程容器加载完成（暴露模块已就绪）。 */
  afterLoadContainer?(remoteInfo: RegistryOption, remoteModule: unknown): void | Promise<void>;
  /** 远程暴露模块就绪（容器级 `onLoad`，携带暴露命名空间）。 */
  onLoad?(info: { appName: string; remoteInfo: RegistryOption; module: unknown }): void | Promise<void>;
  /** 远程加载成功。 */
  afterLoadRemote?(remoteInfo: RegistryOption, remoteModule: unknown): void | Promise<void>;
  /** 远程加载失败。 */
  errorLoadRemote?(error: unknown, remoteInfo: RegistryOption): void | Promise<void>;

  /** 单个共享依赖加载前后。 */
  beforeLoadShare?(name: string): void | Promise<void>;
  afterLoadShare?(name: string, module: unknown, durationMs?: number): void | Promise<void>;

  /** 入口（脚本/入口模块）加载前后。 */
  beforeLoadEntry?(remoteInfo: RegistryOption): void | Promise<void>;
  afterLoadEntry?(remoteInfo: RegistryOption): void | Promise<void>;

  /** 资源预加载前后（`preloadRemote`）。 */
  beforePreloadRemote?(options: unknown): void | Promise<void>;
  afterPreloadRemote?(manifest: unknown, assets: string[]): void | Promise<void>;
}

function getPlugins(): RuntimePlugin[] {
  return getInstance().plugins;
}

/** 注册一个或多个插件（同名插件只保留首个），并对新插件调用 `apply(instance)`。 */
function registerPlugin(plugin: RuntimePlugin | RuntimePlugin[]): void {
  const instance = getInstance();
  const list = Array.isArray(plugin) ? plugin : [plugin];
  for (const item of list) {
    if (!item || typeof item.name !== 'string') {
      continue;
    }
    if (instance.plugins.some((existing) => existing.name === item.name)) {
      continue;
    }
    instance.plugins.push(item);
    if (typeof item.apply === 'function') {
      try {
        item.apply(instance);
      } catch (error) {
        console.warn(`[linkjs] plugin "${item.name}.apply" failed:`, error);
      }
    }
  }
}

/** 依次调用所有插件的同名钩子（容错：异常记录后继续）。 */
async function runHook(hook: keyof RuntimePlugin, ...args: unknown[]): Promise<void> {
  for (const plugin of getPlugins()) {
    const fn = plugin[hook];
    if (typeof fn === 'function') {
      try {
        await (fn as (...a: unknown[]) => unknown).apply(plugin, args);
      } catch (error) {
        console.warn(`[linkjs] plugin "${plugin.name}.${String(hook)}" failed:`, error);
      }
    }
  }
}

/** 依次调用 `beforeLoadRemote`，把返回值串联成最终的 remoteInfo。 */
async function runBeforeLoadRemote(remoteInfo: RegistryOption): Promise<RegistryOption> {
  let info = remoteInfo;
  for (const plugin of getPlugins()) {
    if (typeof plugin.beforeLoadRemote === 'function') {
      try {
        const next = await plugin.beforeLoadRemote(info);
        if (next) {
          info = next;
        }
      } catch (error) {
        console.warn(`[linkjs] plugin "${plugin.name}.beforeLoadRemote" failed:`, error);
      }
    }
  }
  return info;
}

/** 调用 `beforeInit` / `afterInit`（同步执行；异步初始化请放在 `beforeLoadRemote` 等异步钩子）。 */
function runInitHooks(options: unknown, instance: unknown): void {
  for (const plugin of getPlugins()) {
    try {
      plugin.beforeInit?.(options);
      plugin.afterInit?.(instance);
    } catch (error) {
      console.warn(`[linkjs] plugin "${plugin.name}" init failed:`, error);
    }
  }
}

export { registerPlugin, getPlugins, runHook, runBeforeLoadRemote, runInitHooks };
