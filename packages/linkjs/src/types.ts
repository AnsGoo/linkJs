/**
 * 远程暴露 / 共享依赖的模块命名空间（浏览器 ESM 形态，具体结构由业务决定）。
 *
 * 用于替代此前误用的 Node `module` 类型：浏览器运行时并不存在 CJS 的 `Module`，
 * 暴露对象的形态由业务决定（组件映射、`{ mount, unmount }` 契约等）。
 */
export type RemoteModule = Record<string, unknown>;

/** 共享依赖的模块值：模块本身或惰性加载工厂（同步 / 异步）。 */
export type ShareModule = RemoteModule | (() => RemoteModule) | (() => Promise<RemoteModule>);

/** 共享依赖的选取策略。 */
export type ShareStrategy = 'version-first' | 'loaded-first';

/** 宿主框架 runtime 的构建模式（决定子应用走共享还是本地）。 */
export type InstanceMode = 'development' | 'production';
