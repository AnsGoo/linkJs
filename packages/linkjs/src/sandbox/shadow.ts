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
  /**
   * 已归属该远程的样式模块路径（dev-id 去掉 query 后的部分）。
   * 用于 HMR 时把「重新创建」的样式节点继续路由进影子树：
   * 例如把 `<style scoped>` 改成 `<style>` 会改变样式模块 id（去掉 scoped 段），
   * Vite 会新建一个 `<style>` 元素，需要按模块路径重新匹配。
   */
  modulePaths: Set<string>;
  /**
   * 持有该目标的隔离计数。`createRemoteApp`（路线 B）与 `LinkjsShadowRoot`（路线 A）
   * 可同时消费同名远程，二者共用同一影子树；只有全部释放后才拆除宿主元素。
   */
  refs: number;
}

const targets = new Map<string, ShadowTarget>();

/**
 * 「样式捕获窗口」栈：多个远程可能**并发加载**（各自的加载期窗口重叠），
 * 用栈记录所有开启中的目标；新注入的 style/link 归到栈顶（最近开启的加载）。
 * 结束窗口只移除对应目标，避免一个远程的结束清掉另一个仍在加载的远程的窗口。
 */
let captureStack: ShadowTarget[] = [];

/** 当前归属目标（栈顶），无窗口时为 null。 */
function activeCaptureTarget(): ShadowTarget | null {
  return captureStack.length > 0 ? captureStack[captureStack.length - 1] : null;
}

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

/** 取样式节点的归属标识：dev 下是 `data-vite-dev-id`，构建产物 link 用 href。 */
function styleIdent(node: Node): string | null {
  const el = node as HTMLElement;
  if (typeof el.getAttribute !== 'function') {
    return null;
  }
  const devId = el.getAttribute('data-vite-dev-id');
  if (devId) {
    return devId;
  }
  if (typeof HTMLLinkElement !== 'undefined' && node instanceof HTMLLinkElement) {
    return node.href || null;
  }
  return null;
}

/** 归一化：去掉 query（`?vue&type=style&scoped=...`），保留模块文件路径。 */
function normalizeIdent(ident: string): string {
  return ident.split('?')[0];
}

/**
 * 决定某个样式节点应归属哪个影子树：
 * - 捕获窗口内：归当前加载的远程，并记录其模块路径以便后续 HMR 复用；
 * - 窗口外：按已记录的模块路径匹配（处理 HMR 重建的样式节点）。
 * 都不匹配则返回 null（保持原语义，留在 document.head）。
 */
function routeStyleTarget(node: Node): ShadowTarget | null {
  const ident = styleIdent(node);
  const active = activeCaptureTarget();
  if (active) {
    if (ident) {
      active.modulePaths.add(normalizeIdent(ident));
    }
    return active;
  }
  if (!ident) {
    return null;
  }
  const path = normalizeIdent(ident);
  for (const target of targets.values()) {
    if (target.modulePaths.has(path)) {
      return target;
    }
  }
  return null;
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
    if (isStyleOrStylesheetLink(node)) {
      const target = routeStyleTarget(node);
      if (target) {
        return originalAppendChild.call(target.shadow, node) as T;
      }
    }
    return originalAppendChild.call(this, node) as T;
  };

  Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    if (isStyleOrStylesheetLink(node)) {
      const target = routeStyleTarget(node);
      if (target) {
        return originalInsertBefore.call(target.shadow, node, target.shadow.firstChild) as T;
      }
    }
    return originalInsertBefore.call(this, node, child) as T;
  };

  Element.prototype.insertAdjacentElement = function (
    position: InsertPosition,
    element: Element,
  ): Element | null {
    if (isStyleOrStylesheetLink(element)) {
      const target = routeStyleTarget(element);
      if (target) {
        return originalAppendChild.call(target.shadow, element) as Element;
      }
    }
    return originalInsertAdjacentElement.call(this, position, element);
  };

  // append/prepend：只把能路由到影子树的样式节点分流，其余节点保持原语义。
  Element.prototype.append = function (...nodes: (Node | string)[]): void {
    const rest: (Node | string)[] = [];
    for (const node of nodes) {
      if (node instanceof Node && isStyleOrStylesheetLink(node)) {
        const target = routeStyleTarget(node);
        if (target) {
          originalAppendChild.call(target.shadow, node);
          continue;
        }
      }
      rest.push(node);
    }
    if (rest.length > 0) {
      originalAppend.apply(this, rest);
    }
  };

  Element.prototype.prepend = function (...nodes: (Node | string)[]): void {
    const rest: (Node | string)[] = [];
    for (const node of nodes) {
      if (node instanceof Node && isStyleOrStylesheetLink(node)) {
        const target = routeStyleTarget(node);
        if (target) {
          originalInsertBefore.call(target.shadow, node, target.shadow.firstChild);
          continue;
        }
      }
      rest.push(node);
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
  return { name, host, shadow, mountPoint, modulePaths: new Set<string>(), refs: 0 };
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

/** 开启某个目标的样式捕获窗口（幂等；同名重复开启不重复入栈）。 */
export function beginStyleCapture(name: string): void {
  const target = targets.get(name);
  if (target && !captureStack.includes(target)) {
    captureStack.push(target);
  }
}

/**
 * 结束样式捕获窗口：传 `name` 精确移除该目标（推荐，支持并发加载），
 * 不传则弹出栈顶（兼容旧的一次一个场景）。
 */
export function endStyleCapture(name?: string): void {
  if (name === undefined) {
    captureStack.pop();
    return;
  }
  const target = targets.get(name);
  captureStack = captureStack.filter((item) => item !== target);
}

/** 已注册目标对应的 ShadowRoot。 */
export function getShadowRoot(name: string): ShadowRoot | undefined {
  return targets.get(name)?.shadow;
}

export interface CreateShadowIsolationOptions {
  /** ShadowRoot 模式，默认 `open`。 */
  mode?: ShadowRootMode;
  /**
   * 是否开启样式捕获窗口，默认 `true`（`createRemoteApp` 用：捕获窗口覆盖子应用加载）。
   *
   * 宿主自渲染的容器（`LinkjsShadowRoot` / `createRemoteComponent`）应传 `false`：
   * 样式由 `loadApp/loadLib({ shadow: true })` 在加载期捕获，它只需接管影子树。
   * 若也开启并立即关闭，会**打断正在进行的其它远程加载**的捕获窗口，导致样式漏到
   * `document.head` 而隔离失效。
   */
  capture?: boolean;
}

/**
 * 把某个远程的 Shadow 目标挂到真实容器上。若该远程此前已被 `loadApp({ shadow: true })`
 * 预加载（存在游离目标），则复用其宿主元素，从而保留预加载期间捕获的样式。
 *
 * 同一 name 可被多个消费者共享（例如 `createRemoteApp` 与 `LinkjsShadowRoot` 同时消费
 * 同一远程）：宿主元素只在首次挂载时插入真实容器，之后不再搬运；引用计数归零才拆除。
 * 各消费者应各自在 `iso.shadow` 内追加独立挂载节点，避免互相清空内容。
 */
export function createShadowIsolation(
  container: HTMLElement,
  name: string,
  options: CreateShadowIsolationOptions = {},
): ShadowIsolation {
  const target = ensureShadowTarget(name, options.mode ?? 'open');
  target.refs += 1;
  // 只在宿主元素尚未接入真实 DOM 时插入，避免多个消费者互相搬运元素。
  if (!target.host.isConnected && target.host.parentNode !== container) {
    container.appendChild(target.host);
  }
  // 仅当本次隔离负责捕获窗口时才开启，避免非加载方误开/误关全局捕获。
  const ownsCapture = options.capture !== false;
  if (ownsCapture) {
    beginStyleCapture(name);
  }

  let disposed = false;
  const releaseCapture = () => {
    if (ownsCapture) {
      endStyleCapture(name);
    }
  };
  return {
    shadow: target.shadow,
    mountPoint: target.mountPoint,
    stopCapture: releaseCapture,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      releaseCapture();
      // 仍有其它消费者持有同一影子树：保留宿主元素，交给最后一个释放者拆除。
      target.refs = Math.max(0, target.refs - 1);
      if (target.refs > 0) {
        return;
      }
      target.host.remove();
      targets.delete(name);
      if (targets.size === 0) {
        restoreDom();
      }
    },
  };
}
