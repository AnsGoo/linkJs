/**
 * 页内 DevTools 面板（仅开发模式挂载）。
 *
 * 在页面右下角注入一个小图标（Shadow DOM 隔离样式），点击展开可观测面板：
 * remotes / shares / plugins / diagnostics，并在出现错误诊断时显示红点。
 *
 * 核心运行时（`index.ts` 的 `maybeInstallDevtoolsUI`）只在开发模式动态 `import()` 本模块，
 * 生产构建不会加载。
 */

import { buildSnapshot, getDiagnostics, onDiagnostic } from './index';

export type DevtoolsPosition = 'bottom-right' | 'bottom-left';

export interface DevtoolsUIOptions {
  position?: DevtoolsPosition;
}

const STORAGE_KEY = '__linkjs_devtools_open__';
const HOST_ID = '__linkjs_devtools__';

let host: HTMLElement | null = null;
let offDiagnostic: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

const CSS = `
:host { all: initial; }
.host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.pointer { pointer-events: auto; }
.badge { position: absolute; bottom: 16px; width: 40px; height: 40px; border-radius: 50%;
  border: none; cursor: pointer; color: #fff; font-weight: 700; font-size: 16px;
  background: linear-gradient(135deg, #42d392, #647eff);
  box-shadow: 0 4px 14px rgba(0,0,0,.28); display: grid; place-items: center; }
.badge.right { right: 16px; } .badge.left { left: 16px; }
.badge .dot { position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border-radius: 50%;
  background: #e5484d; border: 2px solid #fff; display: none; }
.badge.has-error .dot { display: block; }
.panel { position: absolute; bottom: 64px; width: 380px; max-height: 62vh; overflow: auto;
  background: #1e1e2e; color: #e6e6f0; border-radius: 10px; padding: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,.45); display: none; }
.panel.right { right: 16px; } .panel.left { left: 16px; }
.panel.open { display: block; }
.panel h2 { margin: 0 0 10px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; color: #cdd0dc; }
.panel h3 { margin: 12px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b90a4; }
.row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; border-bottom: 1px solid #2a2a3a; }
.row:last-child { border-bottom: none; }
.row .k { color: #aab; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .v { color: #e6e6f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pill { padding: 0 6px; border-radius: 8px; font-size: 10px; line-height: 16px; background: #33334a; color: #cdd0dc; }
.pill.loaded { background: #1f6f4a; color: #d8ffe9; }
.pill.error { background: #7a2530; color: #ffd9dd; }
.diag { padding: 4px 0; border-bottom: 1px solid #2a2a3a; }
.diag .code { color: #ffb4a2; font-family: ui-monospace, monospace; }
.diag.error .code { color: #ff6b6b; }
.muted { color: #777c8f; }
button.icon { background: transparent; border: none; color: #8b90a4; cursor: pointer; font-size: 14px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function row(key: string, value: string, pillClass?: string): HTMLElement {
  const v = pillClass ? el('span', { class: `pill ${pillClass}` }) : el('span', { class: 'v' });
  v.textContent = value;
  return el('div', { class: 'row' }, [el('span', { class: 'k' }, [key]), v]);
}

function render(instance: unknown, panel: HTMLElement): void {
  const snapshot = buildSnapshot(instance);
  panel.replaceChildren();

  const header = el('h2', {}, [
    el('span', {}, ['LinkJS DevTools']),
    el('span', { class: 'muted' }, [`${snapshot.instance.mode} · ${snapshot.instance.shareStrategy}`]),
  ]);
  panel.append(header);

  panel.append(el('h3', {}, ['Remotes']));
  if (snapshot.remotes.length === 0) {
    panel.append(el('div', { class: 'muted' }, ['(none)']));
  }
  for (const remote of snapshot.remotes) {
    panel.append(
      row(
        `${remote.name}${remote.type ? ` (${remote.type})` : ''}`,
        remote.status || '-',
        remote.status === 'loaded' ? 'loaded' : undefined,
      ),
    );
  }

  panel.append(el('h3', {}, ['Shared']));
  if (snapshot.shares.length === 0) {
    panel.append(el('div', { class: 'muted' }, ['(none)']));
  }
  for (const share of snapshot.shares) {
    for (const version of share.versions) {
      panel.append(
        row(
          `${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`,
          `${version.version}${version.loaded ? ' ✓' : ''}`,
          version.loaded ? 'loaded' : undefined,
        ),
      );
    }
  }

  panel.append(el('h3', {}, [`Plugins (${snapshot.plugins.length})`]));
  panel.append(
    el('div', { class: 'muted' }, [snapshot.plugins.length ? snapshot.plugins.join(', ') : '(none)']),
  );

  panel.append(el('h3', {}, [`Diagnostics (${snapshot.diagnostics.length})`]));
  if (snapshot.diagnostics.length === 0) {
    panel.append(el('div', { class: 'muted' }, ['(none)']));
  }
  for (const diagnostic of snapshot.diagnostics.slice(-20).reverse()) {
    panel.append(
      el('div', { class: `diag ${diagnostic.level}` }, [
        el('span', { class: 'code' }, [diagnostic.code]),
        el('span', {}, [` ${diagnostic.message}`]),
      ]),
    );
  }
}

/** 挂载页内 DevTools。重复调用幂等。 */
export function mountDevtoolsUI(instance: unknown, options: DevtoolsUIOptions = {}): void {
  if (host || typeof document === 'undefined' || !document.body) {
    return;
  }
  const position = options.position ?? 'bottom-right';
  const side = position === 'bottom-left' ? 'left' : 'right';

  host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;

  const root = el('div', { class: 'host' });
  const badge = el('button', { class: `badge pointer ${side}`, title: 'LinkJS DevTools' }, ['L']);
  const dot = el('span', { class: 'dot' });
  badge.append(dot);
  const panel = el('div', { class: `panel pointer ${side}` });

  shadow.append(style, root);
  root.append(badge, panel);
  document.body.append(host);

  let open = false;
  const updateDot = () => {
    const hasError = getDiagnostics().some((d) => d.level === 'error');
    badge.classList.toggle('has-error', hasError);
  };
  const refresh = () => render(instance, panel);

  const setOpen = (next: boolean) => {
    open = next;
    panel.classList.toggle('open', open);
    if (open) {
      refresh();
      updateDot();
      if (!timer) {
        timer = setInterval(refresh, 1000);
      }
    } else if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  badge.addEventListener('click', () => setOpen(!open));
  offDiagnostic = onDiagnostic(() => {
    updateDot();
    if (open) {
      refresh();
    }
  });
  updateDot();

  // 恢复上次的展开状态
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      setOpen(true);
    }
  } catch {
    /* ignore */
  }
}

/** 卸载页内 DevTools。 */
export function unmountDevtoolsUI(): void {
  offDiagnostic?.();
  offDiagnostic = undefined;
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  host?.remove();
  host = null;
}
