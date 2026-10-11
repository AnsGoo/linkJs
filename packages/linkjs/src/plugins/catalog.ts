/**
 * linkjs 内置插件目录（供 DevTools 列出“所有可用插件”及其启用状态）。
 *
 * 这里只登记随 linkjs 附带、开箱可用的插件；用户自定义插件通过 `registerPlugin` 注册后
 * 也会出现在面板中。
 */
export interface AvailablePlugin {
  /** 插件名（与 `RuntimePlugin.name` 一致）。 */
  name: string;
  /** 用途说明。 */
  description: string;
}

export const availablePlugins: AvailablePlugin[] = [
  { name: 'linkjs-retry', description: '远程加载失败时按候补 host 重试 / 降级域名' },
  { name: 'linkjs-fallback', description: '远程加载失败时使用兜底模块 / 占位，优雅降级' },
];
