/**
 * 子应用 CSS 作用域隔离。
 *
 * 通过给每条选择器加上 `[data-linkjs-scope="<scope>"] ` 前缀，
 * 使该子应用的样式只在「带有该作用域属性的容器内」生效，
 * 从而避免子应用全局样式泄漏到宿主或其它子应用。
 *
 * 使用方式：
 * - 构建期把本插件加入 PostCSS（Vite: `css.postcss.plugins`）；
 * - 运行期在包裹该子应用的容器上加 `data-linkjs-scope="<scope>"`。
 */

export const LINKJS_SCOPE_ATTR = 'data-linkjs-scope';

const GLOBAL_SELECTOR = /^(html|body|:root)$/;

/**
 * 为单个选择器加作用域前缀。
 * - `:root` / `html` / `body` 直接映射为作用域容器自身；
 * - 已包含作用域属性或 `:global(...)` 的选择器保持不变；
 */
export function scopeSelector(selector: string, attribute: string): string {
  return selector
    .split(',')
    .map((raw) => {
      const sel = raw.trim();
      if (!sel) {
        return raw;
      }
      if (sel.includes(`[${LINKJS_SCOPE_ATTR}=`)) {
        return sel;
      }
      if (sel.startsWith(':global(') && sel.endsWith(')')) {
        return sel.slice(':global('.length, -1).trim();
      }
      if (GLOBAL_SELECTOR.test(sel)) {
        return attribute;
      }
      return `${attribute} ${sel}`;
    })
    .join(', ');
}

/**
 * 创建 PostCSS 插件，把 `<scope>` 作用域套用到所有选择器上。
 * 跳过 `@keyframes` 内部的选择器（from/to/百分比）。
 */
export function createCssScopePlugin(scope: string) {
  const attribute = `[${LINKJS_SCOPE_ATTR}="${scope}"]`;
  return {
    postcssPlugin: 'linkjs-css-scope',
    Rule(rule: any) {
      const parent = rule.parent;
      if (parent && parent.type === 'atrule' && /keyframes/i.test(parent.name)) {
        return;
      }
      if (!Array.isArray(rule.selectors)) {
        return;
      }
      rule.selectors = rule.selectors.map((selector: string) => scopeSelector(selector, attribute));
    },
  };
}

createCssScopePlugin.postcss = true;
