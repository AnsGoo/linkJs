import { makeEventBus, type EventBus, type LinkjsEvents } from '../event-bus';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from '../constant';
import { LIB_EXPOSE, SHARED_EXPOSE, LOAD_STATUS } from '../event-bus/constant';
import type { RuntimePlugin } from '../plugins';
import type { PublicPathResolver, RequestRewriter } from '../loader/utils';
import type { LoadAppOptions } from '../loader/app';
import type { LoadLibOptions } from '../loader/lib';
import type { LoadOptions } from '../loader/options';
import { getShare, loadShare } from '../share';
import { loadRuntime } from '../runtime';
import type { InstanceMode, RemoteModule, ShareModule, ShareStrategy } from '../types';

// 检查 window 对象上是否已经存在 linkjs 实例

export interface RemoteEntry {
  js?: string;
  css?: string;
  html?: string;
  i18n?: string;
  shared?: string;
  types?: string;
  expose?: string;
}

/** 单个候选源（多源列表 / 灰度）。 */
export interface RemoteSource {
  /** 该源的 host 基址。 */
  host?: string;
  /** 该源的静态 CDN 基址（优先于该源的 `host`）。 */
  publicPath?: string;
  /** 灰度权重（>0，默认 1）；`sourceStrategy: 'weighted'` 时生效。 */
  weight?: number;
  /** 任意标签（环境 / 地域 / 版本等，供自定义选择使用）。 */
  labels?: Record<string, string>;
}

/** 多源选择策略：`first-healthy` 取首个健康源；`weighted` 在健康源中按权重灰度。 */
export type RemoteSourceStrategy = 'first-healthy' | 'weighted';

/** 源健康检查配置。 */
export interface RemoteHealthCheck {
  /** 健康检查路径（相对源基址），默认 `manifest.json`。 */
  path?: string;
  /** 单次探测超时（ms），默认 3000。 */
  timeout?: number;
  /** 健康结果缓存时长（ms），默认 30000；`0` 表示不缓存。 */
  interval?: number;
}

export interface RemoteBase {
  name: string;
  entry: string | RemoteEntry;
  host?: string;
  /** 静态 CDN 基址（相对 `host` 独立）；优先于 `host`，可被 `getPublicPath` 覆盖。 */
  publicPath?: string;
  /** 动态基址解析器：按运行时上下文自解析 CDN 基址（可异步）。 */
  getPublicPath?: PublicPathResolver;
  /** 多源候选列表（配合健康检查 / 灰度）；声明后优先于 `host`。 */
  sources?: RemoteSource[];
  /** 多源选择策略，默认 `first-healthy`。 */
  sourceStrategy?: RemoteSourceStrategy;
  /** 源健康检查配置（声明 `sources` 时生效）。 */
  healthCheck?: RemoteHealthCheck;
  /** 展示名（来自远程 manifest 的 `name`），缺省回退 `name`。 */
  displayName?: string;
  /** 远程类型：应用（走 HTML 入口）或库（走 JS 入口）。 */
  type?: 'app' | 'lib';
  shared?: Record<string, Omit<ShareInfo, 'name' | 'lib' | 'status'>>;
  /** 该远程关联的共享作用域（可多个，默认 `global`）。 */
  shareScope?: string[];
  /** 产物 SRI 完整性（path -> `sha384-...`），键为远端 manifest 中的路径。 */
  integrity?: Record<string, string>;
  version?: string;
  expose?: Record<string, unknown>;
  status: (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];
}

export interface RemoteApp extends RemoteBase {
  type: 'app';
  i18n?: Record<string, string>;
  css?: string[];
}

export interface RemoteLib extends RemoteBase {
  type: 'lib';
}

/**
 * 远程信息（注册表条目）。
 *
 * 注册时不一定声明 `type`（由 `loadRemote` 在加载时判定），故以 `RemoteBase`
 * （`type` 可选）为准；`RemoteApp` / `RemoteLib` 为声明式类型辅助。
 */
export type RemoteInfo = RemoteBase;

export type RegistryOption = Omit<RemoteBase, 'status'>;

interface ShareInfo {
  name: string;
  version?: string;
  lib: ShareModule;
  status: keyof typeof LOAD_STATUS;
  scope?: string;
  singleton?: boolean;
  /** 注册后立即加载（运行时近似 Module Federation 的 `eager`）。 */
  eager?: boolean;
  /** 期望版本范围（用于版本诊断）；`false` 表示不校验。 */
  requiredVersion?: string | false;
  /** 版本不满足 `requiredVersion` 时是否抛错（默认仅告警）。 */
  strictVersion?: boolean;
}

export type ShareOption = Omit<ShareInfo, 'status'>;

/** linkjs 单例的运行时契约（供内部与插件共享强类型）。 */
export interface LinkjsInstance {
  eventBus: EventBus<LinkjsEvents>;
  readonly version: string;
  readonly name: string;
  /** 唯一实例标识（多实例/多宿主同页时用于区分）。 */
  readonly id: string;
  apps: Map<string, unknown>;
  libs: Map<string, unknown>;
  shares: Map<string, Map<string, ShareOption[]>>;
  sharedMap: Map<string, Map<string, RemoteModule>>;
  remotes: Map<string, RemoteInfo>;
  plugins: RuntimePlugin[];
  shareStrategy: ShareStrategy;
  /** 宿主构建模式：决定子应用框架 runtime 走共享还是本地（路线 B）。 */
  mode: InstanceMode;
  /** 共享依赖并发加载去重表。 */
  shareInflight?: Map<string, Promise<RemoteModule>>;
  /** 请求 URL 重写器（插件通过 `apply` 注册）。 */
  requestRewriters?: RequestRewriter[];
  /** 全局动态基址解析器（对所有未单独配置的远程生效）。 */
  getPublicPath?: PublicPathResolver;
  /** 全局共享的 dev runtime（跨子应用可见，保证全页只有一份）。 */
  runtimeModules?: Map<string, RemoteModule>;
  /** runtime 并发加载去重。 */
  runtimePending?: Map<string, Promise<RemoteModule>>;
  loadRegistry(this: LinkjsInstance, options: RegistryOption[]): void;
  expose(libName: string, lib: RemoteModule, options?: unknown): void;
  shared(libName: string, sharedModules: Record<string, ShareModule>, options?: unknown): void;
  getShare: typeof getShare;
  loadShare: typeof loadShare;
  loadRuntime: typeof loadRuntime;
  /** 由 `ensureRuntimeMethods()` 惰性挂载，可被插件包装。 */
  loadApp?: (entry: string, options?: LoadAppOptions) => Promise<unknown>;
  loadLib?: (entry: string, options?: LoadLibOptions) => Promise<unknown>;
  loadRemote?: (entry: string, options?: LoadOptions) => Promise<unknown>;
}

function createInstanceObject(): LinkjsInstance {
  const eventBus = makeEventBus<LinkjsEvents>();
  return {
    eventBus,
    version: '1.0.0',
    name: 'linkjs',
    id: `linkjs-${Math.random().toString(36).slice(2, 8)}`,
    apps: new Map(),
    libs: new Map(),
    shares: new Map<string, Map<string, ShareOption[]>>(),
    sharedMap: new Map<string, Map<string, RemoteModule>>(),
    remotes: new Map<string, RemoteInfo>(),
    plugins: [],
    shareStrategy: 'version-first',
    mode: 'production',

    loadRegistry(registryOptions: RegistryOption[]): void {
      registryOptions.forEach((option) => {
        const info: RemoteInfo = {
          ...option,
          status: LOAD_STATUS.UNLOADED,
        };
        this.remotes.set(info.name, info);
      });
    },
    expose(libName: string, lib: RemoteModule, options?: unknown) {
      eventBus.emit(LIB_EXPOSE, {
        libName,
        lib,
        options,
      });
    },
    shared(libName: string, sharedModules: Record<string, ShareModule>, options?: unknown) {
      eventBus.emit(SHARED_EXPOSE, {
        libName,
        shared: sharedModules,
        options,
      });
    },
    getShare: getShare,
    loadShare: loadShare,
    loadRuntime: loadRuntime,
  };
}

const globalObject = globalThis as Record<string, unknown>;

export const linkInstance: LinkjsInstance =
  (globalObject[__LINKJS_INSTANCE__] as LinkjsInstance | undefined) ?? createInstanceObject();

globalObject[__LINKJS_INSTANCE__] = linkInstance;
globalObject['$linkjs'] = {
  debug: {
    config: (content: Record<string, string>) => {
      localStorage.setItem(__LINKJS_OVERRIDES__, JSON.stringify(content));
    },
  },
  expose: linkInstance.expose,
  shared: linkInstance.shared,
  getShare: linkInstance.getShare,
  loadShare: linkInstance.loadShare,
  loadRuntime: linkInstance.loadRuntime,
  getShared: linkInstance.getShare,
  loadShared: linkInstance.loadShare,
};
