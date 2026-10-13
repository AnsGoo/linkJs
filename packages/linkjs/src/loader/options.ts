/** `loadApp` / `loadLib` 的公共加载选项。 */
export interface LoadBaseOptions {
  /** 远程基地址，例如 `http://localhost:8081`。 */
  host?: string;
  /** 等待 expose 的超时时间（毫秒），默认 10000。 */
  timeout?: number;
  /**
   * 是否启用 Shadow DOM 样式隔离。**默认 `true`**（隔离）；显式 `{ shadow: false }` 关闭。
   * 开启后远端样式被捕获进其影子树，消费端需在**同一影子树**内渲染
   * （`createRemoteComponent` / `LinkjsShadowRoot` / `createRemoteApp`）。
   */
  shadow?: boolean;
  /** 中止信号：用于取消入口 HTML 的 fetch（超时/手动中止）。 */
  signal?: AbortSignal;
  /** 是否自动解析并拓扑加载该远程声明的远程依赖，默认 `true`。 */
  deps?: boolean;
}

/** `loadApp` 选项（远程应用，走 HTML 入口）。 */
export interface LoadAppOptions extends LoadBaseOptions {
  /** 入口 HTML 路径（相对 host），默认使用注册信息或 host 本身。 */
  entry?: string;
  /** 需要预加载的共享依赖（仅取键名）。 */
  preload?: Record<string, unknown>;
  /** 网络/脚本加载失败重试次数，默认 0。 */
  retries?: number;
  /** 单个脚本加载失败是否忽略，默认 false。 */
  ignoreScriptError?: boolean;
  /** 是否启用快照沙箱：加载前快照全局，`unloadRemote` 时回滚。 */
  sandbox?: boolean;
}

/** `loadLib` 选项（远程库，走 JS 入口）。 */
export interface LoadLibOptions extends LoadBaseOptions {
  /** 入口 JS 路径（相对 host）。 */
  entryName?: string;
}

/**
 * app / lib 统一的加载选项（`loadRemote` / DevTools 使用）。
 * 由公共基类与两者的差异化字段合并而成。
 */
export type LoadOptions = LoadAppOptions & LoadLibOptions;
