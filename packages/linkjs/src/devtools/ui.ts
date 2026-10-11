/**
 * 页内 DevTools 侧边栏（Vue 实现，仅开发模式挂载）。
 *
 * 用 Vue 构建侧边栏组件并挂载进 ShadowRoot（样式隔离）：收起时只露出竖排 "LinkJS" 标签
 * （有错误诊断时显示红点），点击展开可观测面板 remotes / shares / plugins / diagnostics。
 *
 * 本模块被核心运行时**动态 `import()`**，且 `vue` 为其外部依赖；非 Vue 宿主加载失败时
 * 静默降级，不影响主流程，生产构建也不会加载这段代码。
 */

import { computed, createApp, defineComponent, h, onUnmounted, ref, type App, type PropType, type VNode } from 'vue';
import { buildSnapshot, getDiagnostics, onDiagnostic, type LinkjsSnapshot } from './index';

export type DevtoolsPosition = 'right' | 'left';

export interface DevtoolsUIOptions {
  position?: DevtoolsPosition;
}

const STORAGE_KEY = '__linkjs_devtools_open__';
const HOST_ID = '__linkjs_devtools__';

const CSS = `
:host { all: initial; }
.host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.host, .host * { box-sizing: border-box; }
.sidebar { position: absolute; top: 0; bottom: 0; width: 384px; display: flex;
  pointer-events: auto; transition: transform .25s ease; box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 8px 40px rgba(0,0,0,.35); }
.sidebar.right { right: 0; transform: translateX(calc(100% - 34px)); }
.sidebar.left { left: 0; transform: translateX(calc(-100% + 34px)); }
.sidebar.open { transform: translateX(0); }
.tab { width: 34px; height: 100%; flex: 0 0 34px; cursor: pointer; position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: linear-gradient(180deg, #42d392, #647eff); color: #fff; border: none; padding: 0; }
.sidebar.right .tab { border-radius: 10px 0 0 10px; }
.sidebar.left .tab { border-radius: 0 10px 10px 0; order: 2; }
.tab .logo { writing-mode: vertical-rl; text-orientation: mixed; font-weight: 700; font-size: 12px; letter-spacing: .12em; }
.tab .dot { width: 10px; height: 10px; border-radius: 50%; background: #e5484d; border: 2px solid #fff; display: none; }
.tab.has-error .dot { display: block; }
.content { flex: 1; min-width: 0; overflow: auto; background: #1e1e2e; color: #e6e6f0; padding: 12px 14px; }
.content h2 { margin: 0 0 10px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; color: #cdd0dc; }
.content h3 { margin: 14px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b90a4; }
.row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid #2a2a3a; }
.row:last-child { border-bottom: none; }
.row .k { color: #aab; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .v { color: #e6e6f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pill { padding: 0 6px; border-radius: 8px; font-size: 10px; line-height: 16px; background: #33334a; color: #cdd0dc; }
.pill.loaded { background: #1f6f4a; color: #d8ffe9; }
.diag { padding: 4px 0; border-bottom: 1px solid #2a2a3a; }
.diag .code { color: #ffb4a2; font-family: ui-monospace, monospace; }
.diag.error .code { color: #ff6b6b; }
.muted { color: #777c8f; }
button.close { background: transparent; border: 1px solid #3a3a52; color: #cdd0dc; border-radius: 6px; cursor: pointer; font-size: 11px; padding: 2px 8px; }
`;

function rowEl(key: string, value: string, pill?: string): VNode {
  return h('div', { class: 'row' }, [
    h('span', { class: 'k' }, key),
    pill ? h('span', { class: `pill ${pill}` }, value) : h('span', { class: 'v' }, value),
  ]);
}

function renderSnapshot(snapshot: LinkjsSnapshot, onClose: () => void): VNode[] {
  const nodes: VNode[] = [
    h('h2', {}, [
      h('span', {}, 'LinkJS DevTools'),
      h('span', { class: 'muted' }, `${snapshot.instance.mode} · ${snapshot.instance.shareStrategy}`),
      h('button', { class: 'close', onClick: onClose }, '收起'),
    ]),
  ];

  nodes.push(h('h3', {}, 'Remotes'));
  if (snapshot.remotes.length === 0) {
    nodes.push(h('div', { class: 'muted' }, '(none)'));
  }
  for (const remote of snapshot.remotes) {
    nodes.push(
      rowEl(
        `${remote.name}${remote.type ? ` (${remote.type})` : ''}`,
        remote.status || '-',
        remote.status === 'loaded' ? 'loaded' : undefined,
      ),
    );
  }

  nodes.push(h('h3', {}, 'Shared'));
  if (snapshot.shares.length === 0) {
    nodes.push(h('div', { class: 'muted' }, '(none)'));
  }
  for (const share of snapshot.shares) {
    for (const version of share.versions) {
      nodes.push(
        rowEl(
          `${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`,
          `${version.version}${version.loaded ? ' ✓' : ''}`,
          version.loaded ? 'loaded' : undefined,
        ),
      );
    }
  }

  nodes.push(h('h3', {}, `Plugins (${snapshot.plugins.length})`));
  nodes.push(h('div', { class: 'muted' }, snapshot.plugins.length ? snapshot.plugins.join(', ') : '(none)'));

  nodes.push(h('h3', {}, `Diagnostics (${snapshot.diagnostics.length})`));
  if (snapshot.diagnostics.length === 0) {
    nodes.push(h('div', { class: 'muted' }, '(none)'));
  }
  for (const diagnostic of snapshot.diagnostics.slice(-20).reverse()) {
    nodes.push(
      h('div', { class: `diag ${diagnostic.level}` }, [
        h('span', { class: 'code' }, diagnostic.code),
        h('span', {}, ` ${diagnostic.message}`),
      ]),
    );
  }
  return nodes;
}

const DevtoolsPanel = defineComponent({
  name: 'LinkjsDevtoolsPanel',
  props: {
    instance: { type: Object as PropType<unknown>, required: true },
    position: { type: String as PropType<DevtoolsPosition>, default: 'right' },
  },
  setup(props) {
    const readStored = () => {
      try {
        return localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    };
    const open = ref(readStored());
    const snapshot = ref(buildSnapshot(props.instance));
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = () => {
      snapshot.value = buildSnapshot(props.instance);
    };

    const syncTimer = () => {
      if (open.value) {
        refresh();
        if (!timer) {
          timer = setInterval(refresh, 1000);
        }
      } else if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      try {
        localStorage.setItem(STORAGE_KEY, open.value ? '1' : '0');
      } catch {
        /* ignore */
      }
    };

    const toggle = () => {
      open.value = !open.value;
      syncTimer();
    };
    const close = () => {
      open.value = false;
      syncTimer();
    };

    const off = onDiagnostic(() => {
      if (open.value) {
        refresh();
      }
    });
    onUnmounted(() => {
      off();
      if (timer) {
        clearInterval(timer);
      }
    });
    syncTimer();

    const hasError = computed(() => getDiagnostics().some((diagnostic) => diagnostic.level === 'error'));

    return () =>
      h('div', { class: 'host' }, [
        h(
          'aside',
          { class: ['sidebar', props.position, open.value ? 'open' : ''] },
          [
            h('button', { class: ['tab', hasError.value ? 'has-error' : ''], onClick: toggle }, [
              h('span', { class: 'dot' }),
              h('span', { class: 'logo' }, 'LinkJS'),
            ]),
            h('div', { class: 'content' }, renderSnapshot(snapshot.value, close)),
          ],
        ),
      ]);
  },
});

let host: HTMLElement | null = null;
let app: App | null = null;

/** 挂载页内 DevTools 侧边栏（Vue）。重复调用幂等。 */
export function mountDevtoolsUI(instance: unknown, options: DevtoolsUIOptions = {}): void {
  if (host || typeof document === 'undefined' || !document.body) {
    return;
  }
  host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.body.append(host);

  app = createApp(DevtoolsPanel, { instance, position: options.position === 'left' ? 'left' : 'right' });
  app.mount(container);
}

/** 卸载页内 DevTools 侧边栏。 */
export function unmountDevtoolsUI(): void {
  app?.unmount();
  app = null;
  host?.remove();
  host = null;
}
