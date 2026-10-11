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
  shared?: Record<
    string,
    {
      version: string;
      scope: 'global' | string;
      singleton: boolean;
      dependencies?: string[];
    }
  >;
  [key: string]: any;
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
