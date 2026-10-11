/* eslint-disable */
// @ts-nocheck — Vue 的 `vue/jsx-runtime` JSX 类型未声明 `ElementChildrenAttribute`，
// 在 `jsx: react-jsx` 下 JSX children 会被 tsc 误报。构建（tsdown/oxc）不受影响，故此处跳过该文件的类型检查。
/**
 * 页内 DevTools 侧边栏（Vue TSX 实现，仅开发模式挂载）。
 *
 * 默认收起为**右侧一条竖排 "LinkJS" 标签**（面板未展开）：
 * - 点击标签展开完整面板（远程应用 / 共享依赖 / 插件 / 诊断），并给 `body` 加右侧内边距把内容推开（不悬浮覆盖）；
 * - 点击「收起」或快捷键 `Alt/Option + Shift + L` 可折叠；
 * - 有 error 诊断时标签显示红点。
 *
 * 样式通过 Shadow DOM 隔离；核心运行时只在开发模式动态 `import()` 本模块，且 `vue` 为
 * 外部依赖，非 Vue 宿主加载失败会静默降级，生产构建不加载。
 */

import { computed, createApp, defineComponent, onMounted, onUnmounted, ref, watch, type App, type PropType, type VNode } from 'vue';
import { buildSnapshot, getDiagnostics, onDiagnostic, type LinkjsSnapshot } from './index';

export type DevtoolsPosition = 'right' | 'left';

export interface DevtoolsUIOptions {
  position?: DevtoolsPosition;
}

const STORAGE_KEY = '__linkjs_devtools_open__';
const HOST_ID = '__linkjs_devtools__';
const WIDTH = 384;

const CSS = `
:host { all: initial; }
.host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.host, .host * { box-sizing: border-box; }
.sidebar { position: absolute; top: 0; bottom: 0; width: ${WIDTH}px; display: flex;
  pointer-events: auto; transition: transform .25s ease; z-index: 2;
  box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 8px 40px rgba(0,0,0,.35); }
/* 收起态：始终露出 34px 竖排标签（默认可见，只是面板未展开） */
.sidebar.right { right: 0; transform: translateX(calc(100% - 34px)); }
.sidebar.left { left: 0; transform: translateX(calc(-100% + 34px)); }
.sidebar.right.open, .sidebar.left.open { transform: translateX(0); }
.tab { width: 34px; height: 100%; flex: 0 0 34px; cursor: pointer; position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: linear-gradient(180deg, #42d392, #647eff); color: #fff; border: none; padding: 0; }
.sidebar.right .tab { border-radius: 10px 0 0 10px; }
.sidebar.left .tab { border-radius: 0 10px 10px 0; order: 2; }
.tab .logo { writing-mode: vertical-rl; text-orientation: mixed; font-weight: 700; font-size: 12px; letter-spacing: .12em; }
.tab .dot { width: 10px; height: 10px; border-radius: 50%; background: #e5484d; border: 2px solid #fff; display: none; }
.tab.has-error .dot { display: block; }
.content { flex: 1; min-width: 0; overflow: auto; background: #1e1e2e; color: #e6e6f0; padding: 12px 14px; }
.content h2 { margin: 0 0 10px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #cdd0dc; }
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

function Row(props: { label: string; value: string; pill?: string }): VNode {
  return (
    <div class="row">
      <span class="k">{props.label}</span>
      {props.pill ? <span class={`pill ${props.pill}`}>{props.value}</span> : <span class="v">{props.value}</span>}
    </div>
  );
}

function renderSnapshot(snapshot: LinkjsSnapshot, onClose: () => void): VNode {
  const shareRows = snapshot.shares.flatMap((share) =>
    share.versions.map((version, index) => (
      <Row
        key={`${share.scope}:${share.name}:${version.version}:${index}`}
        label={`${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`}
        value={`${version.version}${version.loaded ? ' ✓' : ''}`}
        pill={version.loaded ? 'loaded' : undefined}
      />
    )),
  );

  return (
    <>
      <h2>
        <span>LinkJS DevTools</span>
        <span class="muted">{`${snapshot.instance.mode} · ${snapshot.instance.shareStrategy}`}</span>
        <button class="close" onClick={onClose}>
          收起
        </button>
      </h2>

      <h3>远程应用</h3>
      {snapshot.remotes.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        snapshot.remotes.map((remote) => (
          <Row
            key={remote.name}
            label={`${remote.name}${remote.type ? ` (${remote.type})` : ''}`}
            value={remote.status || '-'}
            pill={remote.status === 'loaded' ? 'loaded' : undefined}
          />
        ))
      )}

      <h3>共享依赖</h3>
      {shareRows.length === 0 ? <div class="muted">（无）</div> : shareRows}

      <h3>{`插件 (${snapshot.availablePlugins.filter((plugin) => plugin.enabled).length}/${snapshot.availablePlugins.length})`}</h3>
      {snapshot.availablePlugins.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        snapshot.availablePlugins.map((plugin) => (
          <div key={plugin.name} class="row">
            <span class="k" title={plugin.description}>
              {plugin.name}
            </span>
            <span class={`pill ${plugin.enabled ? 'loaded' : ''}`}>{plugin.enabled ? '已启用' : '可用'}</span>
          </div>
        ))
      )}

      <h3>{`诊断 (${snapshot.diagnostics.length})`}</h3>
      {snapshot.diagnostics.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        snapshot.diagnostics
          .slice(-20)
          .reverse()
          .map((diagnostic, index) => (
            <div key={`${diagnostic.time}:${index}`} class={`diag ${diagnostic.level}`}>
              <span class="code">{diagnostic.code}</span>
              <span>{` ${diagnostic.message}`}</span>
            </div>
          ))
      )}
    </>
  );
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

    const onKeydown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && (event.key === 'L' || event.key === 'l')) {
        event.preventDefault();
        toggle();
      }
    };

    // 停靠：展开时给 body 加同侧内边距，把页面内容推开（而非悬浮覆盖）。
    let prevBody: { paddingLeft: string; paddingRight: string; transition: string } | null = null;
    const dock = () => {
      const body = document.body;
      if (!body) {
        return;
      }
      if (!prevBody) {
        prevBody = {
          paddingLeft: body.style.paddingLeft,
          paddingRight: body.style.paddingRight,
          transition: body.style.transition,
        };
      }
      if (open.value) {
        body.style.transition = 'padding .25s ease';
        if (props.position === 'left') {
          body.style.paddingLeft = `${WIDTH}px`;
          body.style.paddingRight = prevBody.paddingRight;
        } else {
          body.style.paddingRight = `${WIDTH}px`;
          body.style.paddingLeft = prevBody.paddingLeft;
        }
      } else {
        body.style.paddingLeft = prevBody.paddingLeft;
        body.style.paddingRight = prevBody.paddingRight;
        body.style.transition = prevBody.transition;
      }
    };
    watch(open, dock);
    watch(() => props.position, dock);

    const off = onDiagnostic(() => {
      if (open.value) {
        refresh();
      }
    });
    onMounted(() => {
      window.addEventListener('keydown', onKeydown);
      dock();
    });
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown);
      off();
      if (timer) {
        clearInterval(timer);
      }
      const body = document.body;
      if (body && prevBody) {
        body.style.paddingLeft = prevBody.paddingLeft;
        body.style.paddingRight = prevBody.paddingRight;
        body.style.transition = prevBody.transition;
      }
    });
    syncTimer();

    const hasError = computed(() => getDiagnostics().some((diagnostic) => diagnostic.level === 'error'));

    return () => (
      <div class="host">
        <aside class={['sidebar', props.position, open.value ? 'open' : '']}>
          <button class={['tab', hasError.value ? 'has-error' : '']} onClick={toggle}>
            <span class="dot" />
            <span class="logo">LinkJS</span>
          </button>
          <div class="content">{renderSnapshot(snapshot.value, close)}</div>
        </aside>
      </div>
    );
  },
});

let host: HTMLElement | null = null;
let app: App | null = null;

/** 挂载页内 DevTools 侧边栏（Vue TSX）。重复调用幂等。 */
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
