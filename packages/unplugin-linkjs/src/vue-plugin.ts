import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** linkjs 的 vue 插件选项：在底层插件选项上追加 `scope`。 */
export interface LinkjsVueOptions {
  /**
   * scoped id 的作用域后缀，保证不同应用**相同相对路径**的组件得到不同 scopeId。
   * 默认取最近 `package.json` 的 `name`（跨 app 唯一）。
   */
  scope?: string;
  /** 其余选项原样透传给底层 vue 插件（`@vitejs/plugin-vue` / `unplugin-vue/rolldown`）。 */
  [key: string]: unknown;
}

/** 从当前项目 `package.json` 推导默认作用域（无法读取时回退常量）。 */
function resolveDefaultScope(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as { name?: string };
    return pkg.name || 'linkjs-app';
  } catch {
    return 'linkjs-app';
  }
}

/** 从**消费方项目**解析底层 vue 插件（它通常是消费方的依赖，而非本包的依赖）。 */
function loadFactory(specifier: string): (options?: Record<string, unknown>) => any {
  const requireFromConsumer = createRequire(resolve(process.cwd(), 'linkjs.vue.js'));
  let mod: unknown;
  try {
    mod = requireFromConsumer(specifier);
  } catch (error) {
    throw new Error(
      `[linkjs] unpluginLinkjs.vue 需要消费方安装 "${specifier}"：${String((error as { message?: string })?.message ?? error)}`,
    );
  }
  return ((mod as { default?: unknown })?.default ?? mod) as (options?: Record<string, unknown>) => any;
}

/**
 * 生成「补充」给 vue 插件的 options：在用户已有选项上合并 per-app 的 `componentIdGenerator`。
 *
 * 用法（保留原有插件调用，只把 options 包一层）：
 * ```ts
 * vue(unpluginLinkjs.vueOptions())                          // Vite
 * VuePlugin(unpluginLinkjs.vueOptions({ isProduction: true })) // tsdown / rolldown
 * ```
 * 未显式传 `componentIdGenerator` 时才会注入；用户自己的生成器优先。
 */
export function linkjsVueOptions(options: LinkjsVueOptions = {}): Record<string, unknown> {
  const { scope, features, ...rest } = options as {
    scope?: string;
    features?: { componentIdGenerator?: unknown } & Record<string, unknown>;
  } & Record<string, unknown>;

  const resolvedScope = scope ?? resolveDefaultScope();
  const userGenerator = features?.componentIdGenerator;

  return {
    ...rest,
    features: {
      ...(features ?? {}),
      componentIdGenerator:
        userGenerator ??
        ((filepath: string, _source: string, _isProduction: boolean | undefined, getHash: (text: string) => string) =>
          getHash(`${filepath}:${resolvedScope}`)),
    },
  };
}

/** 通用实现：加载底层 vue 插件并注入 per-app 的 `componentIdGenerator`。 */
function createVuePlugin(specifier: string, options: LinkjsVueOptions = {}): any {
  return loadFactory(specifier)(linkjsVueOptions(options));
}

/**
 * 自动注入 per-app scoped id 作用域的 vue 插件（避免不同应用相同相对路径的组件
 * scopeId 冲突、样式互相覆盖）。
 *
 * - Vite：`plugins: [unpluginLinkjs.vue(), unpluginLinkjs.vite({ ... })]`
 *   （等价 `@vitejs/plugin-vue`，需消费方安装）
 * - tsdown / rolldown：`plugins: [unpluginLinkjs.vue.rolldown(), unpluginLinkjsRollowPlugin({ ... })]`
 *   （等价 `unplugin-vue/rolldown`，需消费方安装）
 *
 * 未显式传 `componentIdGenerator` 时才会注入；用户自己的生成器优先。
 */
export const linkjsVue = Object.assign(
  (options: LinkjsVueOptions = {}): any => createVuePlugin('@vitejs/plugin-vue', options),
  {
    /** tsdown / rolldown 变体（基于 `unplugin-vue/rolldown`）。 */
    rolldown: (options: LinkjsVueOptions = {}): any => createVuePlugin('unplugin-vue/rolldown', options),
    /** rollup 变体（基于 `unplugin-vue/rollup`）。 */
    rollup: (options: LinkjsVueOptions = {}): any => createVuePlugin('unplugin-vue/rollup', options),
  },
);

export type LinkjsVue = typeof linkjsVue;
