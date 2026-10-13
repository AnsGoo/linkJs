/** 一个入口/expose 的静态与异步资源清单（相对 outDir 的路径）。 */
export interface ManifestAsset {
  js?: {
    sync?: string[];
    async?: string[];
  };
  css?: {
    sync?: string[];
    async?: string[];
  };
}

export interface ManifestJson {
  name: string;
  version: string;
  description: string;
  /**
   * 生产者模式：决定宿主是否为该远程建立类型变更长连接。
   * 构建产物为 `production`；远端 dev server 产出 `development`。
   */
  mode?: 'development' | 'production';
  /** 类型转发元信息（宿主 `consumeTypes` 消费）。 */
  metaData?: {
    /** 扁平自包含的 `.d.ts` 路径（相对 outDir）。 */
    types?: string;
    /** `.d.ts` 内容哈希（内容寻址 + 宿主去重）。 */
    typesHash?: string;
    [key: string]: unknown;
  };
  entry: {
    js?: string;
    css?: string;
    html?: string;
    i18n?: string;
    shared?: string;
    expose?: string;
    types?: string;
    /** 主入口的资源清单，供宿主 `preloadRemote` 预加载。 */
    assets?: ManifestAsset;
  };
  expose?: string[];
  /** 各入口/暴露模块的资源清单（Module Federation manifest 风格的 `exposes`）。 */
  exposes?: Array<{
    name: string;
    path: string;
    assets: ManifestAsset;
  }>;
  /** 产物 SRI 完整性（path -> `sha384-...`），供宿主预加载/校验。 */
  integrity?: Record<string, string>;
  /** 该远程参与的共享作用域（多作用域声明，供宿主解析）。 */
  shareScope?: string[];
  /** 远程资源的静态 CDN 基址（供宿主解析资源位置）。 */
  publicPath?: string;
  shared?: Record<
    string,
    {
      version: string;
      scope: 'global' | string;
      singleton: boolean;
      dependencies?: string[];
    }
  >;
  /** 该远程声明的远程依赖（名 -> 配置），供宿主运行时拓扑加载。 */
  remotes?: Record<string, { version?: string; required?: boolean; host?: string; entryName?: string; expose?: string[] }>;
  [key: string]: any;
}

/** `RemoteTypeTarget.preload` 的覆盖项（缺省沿用该 remote 的类型目标）。 */
export interface RemotePreloadOptions {
  /** 预加载使用的 manifest 地址，默认取该目标的 `manifestUrl`。 */
  manifestUrl?: string;
  /** 预加载基址，默认取该目标的 `host`（或 manifestUrl 的 origin）。 */
  host?: string;
  /** 是否预取 manifest 里的 `entry.assets`，默认 `false`。 */
  prefetch?: boolean;
}

/** 宿主消费类型时的单个远程目标（`consumeTypes`）。 */
export interface RemoteTypeTarget {
  /** 模块名前缀，宿主用 `<name>/<Expose>` 访问。 */
  name: string;
  /** 显式 manifest 地址；与 `host` 二选一。 */
  manifestUrl?: string;
  /** 由 host 推导 `manifestUrl = host + '/manifest.json'`。 */
  host?: string;
  /** 模式覆盖：`auto`（默认，读 manifest.mode）| `development` | `production`。 */
  mode?: 'auto' | 'development' | 'production';
  /**
   * 设为 `true` 或覆盖对象时，宿主启动会**自动预加载**该远程（等价于自动执行
   * `preloadRemote(...)`），无需在 `main` 里手动调用。
   */
  preload?: boolean | RemotePreloadOptions;
}

/** 类型拉取的鉴权配置（与运行时一致）。 */
export interface ConsumeTypesAuth {
  token?: string | (() => string | Promise<string>);
  /** 鉴权 query 参数名，默认 `token`。 */
  queryParam?: string;
}

/** 宿主侧消费远程类型（dts 转发）的配置。 */
export interface ConsumeTypesOptions {
  remotes: RemoteTypeTarget[];
  /** 类型缓存根，默认 `node_modules/.linkjs`。 */
  outDir?: string;
  /** 聚合声明文件名，默认 `linkjs-remotes.d.ts`。 */
  dtsFile?: string;
  auth?: ConsumeTypesAuth;
  /** 拉取超时（ms），默认 5000。 */
  timeout?: number;
  /** SSE 重连退避。 */
  reconnect?: { minDelay?: number; maxDelay?: number; factor?: number };
  /** 是否在 dev 订阅远端事件流（默认 true）。 */
  watch?: boolean;
  /** 是否检测宿主 tsconfig 是否纳入了聚合声明（默认 true，仅 warn）。 */
  checkTsconfig?: boolean;
  /** 注入的 fetch（测试用）。 */
  fetch?: typeof fetch;
}

/** `import { X } from '<remote>'` 运行时虚拟模块的配置。 */
export interface RemoteImportsOptions {
  /**
   * 生成的远程组件是否默认启用 Shadow DOM 隔离。
   * 默认 `false`：普通 DOM，远程样式随加载注入 document。
   */
  shadow?: boolean;
}

export interface UnpluginLinkjsOptions {
  extensions?: string[];
  shared?: Record<
    string,
    {
      lib?: string | any | (() => any) | (() => Promise<any>);
      scope?: 'global' | string;
      singleton?: boolean;
    }
  >;
  isReplaceLinkjs?: boolean;
  /**
   * 该远程参与的共享作用域（写入 manifest `shareScope`，供宿主多作用域解析）。
   * 缺省时由 `shared` 各项的 `scope` 推导（默认 `global`）。
   */
  shareScope?: string[];
  /** 远程资源的静态 CDN 基址（写入 manifest `publicPath`，供宿主分辨率资源）。 */
  publicPath?: string;
  /** 写入 manifest 的 `mode`；缺省 `production`（dev server 侧单列 `development`）。 */
  mode?: 'development' | 'production';
  /** 消费远程类型（生成 `declare module '<remote>/<Expose>'` 与 linkjs 类型注册表）。 */
  consumeTypes?: ConsumeTypesOptions;
  /**
   * 允许宿主用 `import { <Expose> } from '<remote>'` 直接消费远程组件。
   * 基于 `consumeTypes.remotes` 解析远端 manifest 的 exposes，生成运行时虚拟模块
   * （内部为 `createRemoteComponent`，自动加载 + 响应式重解析）。
   *
   * 仅对声明了 `consumeTypes.remotes[].preload`（构建期注入预加载）的 remote 生效；
   * 未声明 preload 的 remote 视为 lazy，不提供 import 语法，只能用运行时 `loadRemote`/`loadLib`。
   * 默认开启；传 `false` 可整体关闭。
   */
  remoteImports?: boolean | RemoteImportsOptions;
  /**
   * 显式声明/覆盖本远程的**远程依赖**（写入 manifest `remotes`）。
   * 缺省时从 `consumeTypes.remotes` 自动派生（`{ host }`）；此处可覆盖/补充
   * `version` / `required` / `entryName` / `expose`，也支持声明不在 consumeTypes 中的依赖。
   */
  remotes?: Record<string, { version?: string; required?: boolean; host?: string; entryName?: string; expose?: string[] }>;
  /**
   * 路线 B：需要自适应 runtime 的框架级依赖（如 `['vue', 'vue-router', 'pinia']`）。
   * dev 下这些依赖改写为 `$linkjs.loadRuntime(name, () => import(name))`：
   * 宿主 DEV 时复用共享 runtime，宿主 PROD 时回退到本应用自带的 runtime。
   * 注意：一组耦合的框架依赖必须一起列出，保证解析到同一份 runtime。
   */
  adaptiveRuntime?: string[];
  exposeOptions?: {
    name?: string;
    version?: string;
  };
}
