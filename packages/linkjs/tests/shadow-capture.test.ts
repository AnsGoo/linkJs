import { expect, test } from 'vitest';
import { beginStyleCapture, endStyleCapture, ensureShadowTarget, getShadowRoot } from '../src/sandbox/shadow';

/**
 * 极简 DOM 桩：只覆盖 shadow.ts 用到的 appendChild / setAttribute / attachShadow。
 * patchDom 会在 `Node.prototype.appendChild` 上打补丁，因此必须在调用前安装全局。
 */
class MockNode {
  children: MockNode[] = [];
  parentNode: MockNode | null = null;
  attrs: Record<string, string> = {};
  appendChild(node: MockNode): MockNode {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node: MockNode): MockNode {
    node.parentNode = this;
    this.children.unshift(node);
    return node;
  }
  removeChild(node: MockNode): MockNode {
    this.children = this.children.filter((child) => child !== node);
    node.parentNode = null;
    return node;
  }
  append(...nodes: MockNode[]): void {
    nodes.forEach((node) => this.appendChild(node));
  }
  prepend(...nodes: MockNode[]): void {
    nodes.forEach((node) => this.insertBefore(node));
  }
  insertAdjacentElement(_position: string, element: MockNode): MockNode {
    return this.appendChild(element);
  }
  setAttribute(key: string, value: string): void {
    this.attrs[key] = value;
  }
  getAttribute(key: string): string | null {
    return this.attrs[key] ?? null;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
  attachShadow(): MockNode {
    const shadow = new MockNode();
    (this as unknown as { shadowRoot: MockNode }).shadowRoot = shadow;
    return shadow;
  }
}

class MockStyle extends MockNode {}

function installDom(): void {
  (globalThis as unknown as { Node: unknown }).Node = MockNode;
  (globalThis as unknown as { Element: unknown }).Element = MockNode;
  (globalThis as unknown as { HTMLStyleElement: unknown }).HTMLStyleElement = MockStyle;
  (globalThis as unknown as { document: unknown }).document = {
    head: new MockNode(),
    createElement: (tag: string) => (tag === 'style' ? new MockStyle() : new MockNode()),
  };
}

function style(devId: string): MockStyle {
  const el = new MockStyle();
  el.setAttribute('data-vite-dev-id', devId);
  return el;
}

test('并发加载时，一个远程的捕获窗口结束不会抢走另一个的样式', () => {
  installDom();
  ensureShadowTarget('app');
  ensureShadowTarget('lib');

  // 两个远程并发加载：窗口重叠
  beginStyleCapture('app');
  beginStyleCapture('lib');
  // lib 先加载完
  endStyleCapture('lib');

  // app 的样式此时才注入：应进入 app 的影子树（修复前会因全局 captureTarget 被清空而漏到 head）
  const head = (globalThis as unknown as { document: { head: MockNode } }).document.head;
  const appStyle = style('/remote/app/Hello.vue?vue&type=style');
  head.appendChild(appStyle);

  expect((getShadowRoot('app') as unknown as MockNode).children).toContain(appStyle);
  expect(head.children).not.toContain(appStyle);

  endStyleCapture('app');
});

test('无窗口时按已记录的模块路径回落到对应影子树（HMR 重建）', () => {
  installDom();
  ensureShadowTarget('app2');

  beginStyleCapture('app2');
  const first = style('/remote/app2/Hello.vue?vue&type=style');
  (globalThis as unknown as { document: { head: MockNode } }).document.head.appendChild(first);
  endStyleCapture('app2');

  // 窗口关闭后再次注入同名模块（HMR 重建），应仍归到 app2
  const rebuilt = style('/remote/app2/Hello.vue?vue&type=style&t=123');
  (globalThis as unknown as { document: { head: MockNode } }).document.head.appendChild(rebuilt);
  expect((getShadowRoot('app2') as unknown as MockNode).children).toContain(rebuilt);
});
