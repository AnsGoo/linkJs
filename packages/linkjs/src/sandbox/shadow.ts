/**
 * Shadow DOM 样式隔离。
 *
 * 思路：把子应用的挂载点放进宿主的 ShadowRoot，并把子应用的样式（Vite dev 注入的
 * `<style data-vite-dev-id>`、构建产物里的 `<link rel="stylesheet">` 等）也一并搬进
 * 同一个 ShadowRoot。浏览器原生保证影子树内外的样式互不影响，因此无需逐条改写选择器。
 *
 * 关键点：宿主可能在挂载容器出现之前就**预加载**远程（例如先 loadApp 预热、再渲染）。
 * 因此这里把「影子容器」与「加载时机」解耦：
 * - `ensureShadowTarget(name)` 会创建一个**游离**的宿主元素 + ShadowRoot，并在加载期间
 *   把远程注入的样式重定向进去；
 * - `createShadowIsolation(container, name)` 挂载时把该宿主元素插入真实容器即可。
 *
 * 与 PostCSS 前缀方案的区别：
 * - 前缀方案依赖构建期改写 + 选择器前缀，跨构建器/跨 dev-build 不一致；
 * - Shadow DOM 方案在运行期生效，与构建器无关，dev 与 build 行为一致。
 *
 * 局限（需知悉）：
 * - `Teleport` 到 `document.body`、`position: fixed` 到视口、直接访问 `document` 的
 *   第三方库会逃出影子树；
 * - 宿主定义在 `:root` 的自定义属性会继承进影子树（可直接用 `var(--x)`），但针对
 *   `body`/`html` 的全局样式不会作用于影子树内部。
 */

export interface ShadowIsolation {
  /** 挂到宿主元素上的 ShadowRoot。 */
  shadow: ShadowRoot;
  /** 交给子应用 runtime 的挂载点（ShadowRoot 内）。 */
  mountPoint: HTMLElement;
  /** 结束样式捕获窗口（子应用挂载完成后调用）。 */
  stopCapture(): void;
  /** 卸载：销毁捕获、把游离宿主元素移出 DOM、恢复被 patch 的 DOM 方法。 */
  dispose(): void;
}

export interface ShadowTarget {
  name: string;
  /** 由本模块创建的宿主元素（可游离于 DOM 之外，挂载时再插入）。 */
  host: HTMLElement;
  shadow: ShadowRoot;
  mountPoint: HTMLElement;
}

const targets = new Map<string, ShadowTarget>();

/** 当前处于「样式捕获窗口」的目标：窗口内新增的 style/link 会被重定向进影子树。 */
let captureTarget: ShadowTarget | null = null;

const SCOPE_HOST_ATTR = 'data-linkjs-shadow-host';
const SCOPE_MOUNT_ATTR = 'data-linkjs-shadow-mount';

function isStyleOrStylesheetLink(node: Node): boolean {
  if (typeof HTMLStyleElement !== 'undefined' && node instanceof HTMLStyleElement) {
    return true;
  }
  if (typeof HTMLLinkElement !== 'undefined' && node instanceof HTMLLinkElement) {
    return (node as HTMLLinkElement).rel === 'stylesheet';
  }
  return false;
}

// --- DOM 方法补丁 -------------------------------------------------------------
// Vite 的 HMR 客户端用 `document.head.appendChild` / `insertAdjacentElement` 注入样式，
// 并在 HMR 时用 `document.head.removeChild` 回收。我们在捕获窗口内把这些插入重定向到
// 影子树，同时让 removeChild 兼容「节点已不在原父节点下」的情况，避免 HMR 报错。

let patched = false;
let originalAppendChild: typeof Node.prototype.appendChild;
let originalInsertBefore: typeof Node.prototype.insertBefore;
let originalRemoveChild: typeof Node.prototype.removeChild;
let originalInsertAdjacentElement: typeof Element.prototype.insertAdjacentElement;
let originalAppend: typeof Element.prototype.append;
let originalPrepend: typeof Element.prototype.prepend;

function patchDom(): void {
  if (patched || typeof Node === 'undefined') {
    return;
  }
  patched = true;

  originalAppendChild = Node.prototype.appendChild;
  originalInsertBefore = Node.prototype.insertBefore;
  originalRemoveChild = Node.prototype.removeChild;
  originalInsertAdjacentElement = Element.prototype.insertAdjacentElement;
  originalAppend = Element.prototype.append;
  originalPrepend = Element.prototype.prepend;

  Node.prototype.appendChild = function <T extends Node>(node: T): T {
    if (captureTarget && isStyleOrStylesheetLink(node)) {
      return originalAppendChild.call(captureTarget.shadow, node) as T;
    }
    return originalAppendChild.call(this, node) as T;
  };

  Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    if (captureTarget && isStyleOrStylesheetLink(node)) {
      return originalInsertBefore.call(captureTarget.shadow, node, captureTarget.shadow.firstChild) as T;
    }
    return originalInsertBefore.call(this, node, child) as T;
  };

  Element.prototype.insertAdjacentElement = function (
    position: InsertPosition,
    element: Element,
  ): Element | null {
    if (captureTarget && isStyleOrStylesheetLink(element)) {
      return originalAppendChild.call(captureTarget.shadow, element) as Element;
    }
    return originalInsertAdjacentElement.call(this, position, element);
  };

  // append/prepend：只把样式节点分流到影子树，其余节点保持原语义，避免误搬。
  Element.prototype.append = function (...nodes: (Node | string)[]): void {
    if (!captureTarget) {
      return originalAppend.apply(this, nodes);
    }
    const rest: (Node | string)[] = [];
    for (const node of nodes) {
      if (node instanceof Node && isStyleOrStylesheetLink(node)) {
        originalAppendChild.call(captureTarget.shadow, node);
      } else {
        rest.push(node);
      }
    }
    if (rest.length > 0) {
      originalAppend.apply(this, rest);
    }
  };

  Element.prototype.prepend = function (...nodes: (Node | string)[]): void {
    if (!captureTarget) {
      return originalPrepend.apply(this, nodes);
    }
    const rest: (Node | string)[] = [];
    for (const node of nodes) {
      if (node instanceof Node && isStyleOrStylesheetLink(node)) {
        originalInsertBefore.call(captureTarget.shadow, node, captureTarget.shadow.firstChild);
      } else {
        rest.push(node);
      }
    }
    if (rest.length > 0) {
      originalPrepend.apply(this, rest);
    }
  };

  // 节点可能已被搬进影子树；移除时以真实父节点为准，避免 NotFoundError。
  Node.prototype.removeChild = function <T extends Node>(node: T): T {
    const parent = node.parentNode;
    if (parent && parent !== this) {
      return originalRemoveChild.call(parent, node) as T;
    }
    return originalRemoveChild.call(this, node) as T;
  };
}

function restoreDom(): void {
  if (!patched) {
    return;
  }
  patched = false;
  Node.prototype.appendChild = originalAppendChild;
  Node.prototype.insertBefore = originalInsertBefore;
  Node.prototype.removeChild = originalRemoveChild;
  Element.prototype.insertAdjacentElement = originalInsertAdjacentElement;
  Element.prototype.append = originalAppend;
  Element.prototype.prepend = originalPrepend;
}

// --- 目标管理 ----------------------------------------------------------------

function createTarget(name: string, mode: ShadowRootMode): ShadowTarget {
  const host = document.createElement('div');
  host.setAttribute(SCOPE_HOST_ATTR, name);
  const shadow = host.attachShadow({ mode });
  const mountPoint = document.createElement('div');
  mountPoint.setAttribute(SCOPE_MOUNT_ATTR, name);
  shadow.appendChild(mountPoint);
  return { name, host, shadow, mountPoint };
}

/**
 * 确保存在某个远程的 Shadow 目标（幂等）。会创建游离宿主元素并开启样式捕获，
 * 因此在 `loadApp` 里、脚本执行前调用即可把随后注入的样式收进影子树。
 */
export function ensureShadowTarget(name: string, mode: ShadowRootMode = 'open'): ShadowTarget {
  let target = targets.get(name);
  if (!target) {
    target = createTarget(name, mode);
    targets.set(name, target);
    patchDom();
  }
  return target;
}

/** 开启某个目标的样式捕获窗口。 */
export function beginStyleCapture(name: string): void {
  const target = targets.get(name);
  if (target) {
    captureTarget = target;
  }
}

/** 结束样式捕获窗口。 */
export function endStyleCapture(): void {
  captureTarget = null;
}

/** 已注册目标对应的 ShadowRoot。 */
export function getShadowRoot(name: string): ShadowRoot | undefined {
  return targets.get(name)?.shadow;
}

export interface CreateShadowIsolationOptions {
  /** ShadowRoot 模式，默认 `open`。 */
  mode?: ShadowRootMode;
}

/**
 * 把某个远程的 Shadow 目标挂到真实容器上。若该远程此前已被 `loadApp({ shadow: true })`
 * 预加载（存在游离目标），则复用其宿主元素，从而保留预加载期间捕获的样式。
 */
export function createShadowIsolation(
  container: HTMLElement,
  name: string,
  options: CreateShadowIsolationOptions = {},
): ShadowIsolation {
  const target = ensureShadowTarget(name, options.mode ?? 'open');
  if (target.host.parentNode !== container) {
    container.appendChild(target.host);
  }
  beginStyleCapture(name);

  let disposed = false;
  return {
    shadow: target.shadow,
    mountPoint: target.mountPoint,
    stopCapture() {
      if (captureTarget === target) {
        endStyleCapture();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (captureTarget === target) {
        endStyleCapture();
      }
      target.host.remove();
      targets.delete(name);
      if (targets.size === 0) {
        restoreDom();
      }
    },
  };
}
