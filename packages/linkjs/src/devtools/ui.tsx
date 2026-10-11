/* eslint-disable */
// @ts-nocheck — Vue 的 `vue/jsx-runtime` JSX 类型未声明 `ElementChildrenAttribute`，
// 在 `jsx: react-jsx` 下 JSX children 会被 tsc 误报。构建（tsdown/oxc）不受影响，故此处跳过该文件的类型检查。
/**
 * 页内 DevTools 侧边栏（Vue TSX 实现，仅开发模式挂载）。
 *
 * 默认收起为**右侧一条竖排 "LinkJS" 标签**（面板未展开）：
 * - 点击展开完整面板（远程应用 / 共享依赖 / 共享冲突 / 插件 / 指标 / 性能 / 诊断），并给 `body` 加同侧内边距把内容推开（不悬浮覆盖）；
 * - 支持：按文本过滤、复制 JSON、拖拽调整宽度、快捷键 `Alt/Option + Shift + L` 折叠/展开；
 * - 有 error 诊断时标签显示红点。
 *
 * 样式通过 Shadow DOM 隔离；核心运行时只在开发模式动态 `import()` 本模块，且 `vue` 为外部依赖。
 */

import { computed, createApp, defineComponent, onMounted, onUnmounted, ref, watch, type App, type PropType, type VNode } from 'vue';
import { buildSnapshot, getDiagnostics, onDiagnostic, type LinkjsSnapshot } from './index';

export type DevtoolsPosition = 'right' | 'left';

export interface DevtoolsUIOptions {
  position?: DevtoolsPosition;
}

const STORAGE_KEY = '__linkjs_devtools_open__';
const WIDTH_KEY = '__linkjs_devtools_width__';
const HOST_ID = '__linkjs_devtools__';
const DEFAULT_WIDTH = 384;

const CSS = `
:host { all: initial; }
.host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.host, .host * { box-sizing: border-box; }
.sidebar { position: absolute; top: 0; bottom: 0; display: flex;
  pointer-events: auto; transition: transform .25s ease; z-index: 2;
  box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 8px 40px rgba(0,0,0,.35); }
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
.content h2 { margin: 0 0 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #cdd0dc; }
.content .id { color: #6b7085; font-weight: 400; font-size: 11px; }
.content h3 { margin: 14px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b90a4; }
.row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid #2a2a3a; }
.row:last-child { border-bottom: none; }
.row .k { color: #aab; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .v { color: #e6e6f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.row .actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.pill { padding: 0 6px; border-radius: 8px; font-size: 10px; line-height: 16px; background: #33334a; color: #cdd0dc; white-space: nowrap; }
.pill.loaded { background: #1f6f4a; color: #d8ffe9; }
.pill.error { background: #7a2530; color: #ffd9dd; }
.diag { padding: 4px 0; border-bottom: 1px solid #2a2a3a; }
.diag .code { color: #ffb4a2; font-family: ui-monospace, monospace; }
.diag.error .code { color: #ff6b6b; }
.muted { color: #777c8f; }
.toolbar { display: flex; gap: 6px; margin: 6px 0 2px; }
.toolbar input { flex: 1; min-width: 0; background: #15151f; border: 1px solid #33334a; color: #e6e6f0; border-radius: 6px; padding: 3px 8px; font-size: 12px; }
button.mini { background: transparent; border: 1px solid #3a3a52; color: #cdd0dc; border-radius: 6px; cursor: pointer; font-size: 11px; padding: 2px 8px; white-space: nowrap; }
.hint { color: #565b70; font-size: 10px; margin-top: 10px; }
.handle { position: absolute; top: 0; bottom: 0; width: 6px; cursor: col-resize; background: transparent; }
.sidebar.right .handle { left: 34px; }
.sidebar.left .handle { right: 34px; }
.handle:hover { background: rgba(100,126,255,.4); }
`;

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function kindLabel(kind: string): string {
  return kind === 'lib' ? '库' : kind === 'remote' ? '远程' : '应用';
}

function rowEl(key: string, value: string, pill?: string): VNode {
  return (
    <div class="row">
      <span class="k">{key}</span>
      {pill ? <span class={`pill ${pill}`}>{value}</span> : <span class="v">{value}</span>}
    </div>
  );
}

function renderSnapshot(snapshot: LinkjsSnapshot, filter: string, onCopy: () => void, onClose: () => void): VNode {
  const q = filter.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const show = (key: string) => !q || key.toLowerCase().includes(q);

  // 全局操作入口（由 installDevtools 注入到 window.__LINKJS__）。
  const ops = (globalThis as any).__LINKJS__ as
    | undefined
    | { preload?: (o: unknown) => Promise<unknown>; unload?: (n?: string) => void; unloadLib?: (e?: string) => void };

  // 注册名 -> 远程 manifest 包名（展示名）
  const displayByApp = new Map(snapshot.remotes.map((remote) => [remote.name, remote.displayName || remote.name]));
  const prettyEntry = (entry: string) => {
    const [app, ...rest] = entry.split('/');
    return [displayByApp.get(app) || app, ...rest].join('/');
  };

  // 性能标签按当前 displayName 动态生成（避免“标签在加载瞬间被冻结”导致与展示名不一致）。
  const perfLabel = (name: string) => {
    if (name.startsWith('linkjs:load:app:')) {
      const [app, ...phaseParts] = name.slice('linkjs:load:app:'.length).split(':');
      const dn = displayByApp.get(app) || app;
      const phase = phaseParts.join(':');
      if (phase === 'fetch') {
        return `拉取入口 HTML「${dn}」`;
      }
      if (phase === 'scripts') {
        return `加载远程脚本「${dn}」`;
      }
      return `加载应用「${dn}」`;
    }
    if (name.startsWith('linkjs:load:lib:')) {
      const app = name.slice('linkjs:load:lib:'.length);
      return `加载库「${displayByApp.get(app) || app}」`;
    }
    if (name.startsWith('linkjs:share:')) {
      return `加载共享依赖「${name.slice('linkjs:share:'.length)}」`;
    }
    return name;
  };

  const remotes = snapshot.remotes.filter((remote) => match(`${remote.name} ${remote.displayName ?? ''} ${remote.type ?? ''} ${remote.status ?? ''} ${remote.host ?? ''}`));
  const shareRows = snapshot.shares.flatMap((share) =>
    share.versions
      .filter((v) => match(`${share.name} ${share.scope} ${v.version}`))
      .map((v, index) => (
        <div key={`${share.scope}:${share.name}:${v.version}:${index}`} class="row">
          <span class="k">{`${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`}</span>
          <span class={`pill ${v.loaded ? 'loaded' : ''}`}>{`${v.version}${v.loaded ? ' ✓' : ''}`}</span>
        </div>
      )),
  );
  const conflicts = snapshot.conflicts.filter((c) => match(`${c.name} ${c.requiredVersion}`));
  const plugins = snapshot.availablePlugins.filter((p) => show(p.name));
  const metrics = snapshot.metrics.filter((m) => match(`${m.entry} ${m.status} ${m.host ?? ''}`)).slice(-12).reverse();
  const perf = snapshot.perf.filter((p) => show(p.name)).slice(-12).reverse();
  const events = snapshot.events
    .filter((e) => match(`${e.type} ${e.summary}`))
    .slice(-20)
    .reverse();
  const diagnostics = snapshot.diagnostics
    .filter((d) => match(`${d.code} ${d.message}`))
    .slice(-20)
    .reverse();

  return (
    <>
      <h2>
        <span>
          LinkJS DevTools <span class="id">{snapshot.instance.id}</span>
        </span>
        <span>
          <button class="mini" onClick={onCopy}>
            复制 JSON
          </button>{' '}
          <button class="mini" onClick={onClose}>
            收起
          </button>
        </span>
      </h2>

      <h3>远程应用</h3>
      {remotes.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        remotes.map((remote) => (
          <div key={remote.name} class="row">
            <span class="k" title={`${remote.name}${remote.host ? ` @${remote.host}` : ''}`}>
              {`${remote.displayName || remote.name}${remote.displayName && remote.displayName !== remote.name ? ` (${remote.name})` : ''}${remote.type ? ` · ${remote.type}` : ''}`}
            </span>
            <span class="actions">
              <span class={`pill ${remote.status === 'loaded' ? 'loaded' : ''}`}>{remote.status || '-'}</span>
              <button class="mini" title="按 manifest 预取资源" onClick={() => void ops?.preload?.({ name: remote.name })}>
                预取
              </button>
              <button
                class="mini"
                title={remote.type === 'lib' ? '卸载远程库（清缓存 / 移除资源）' : '卸载远程应用（清缓存 / 移除资源）'}
                onClick={() => (remote.type === 'lib' ? ops?.unloadLib?.(remote.name) : ops?.unload?.(remote.name))}
              >
                卸载
              </button>
            </span>
          </div>
        ))
      )}

      <h3>共享依赖</h3>
      {shareRows.length === 0 ? <div class="muted">（无）</div> : shareRows}

      {conflicts.length > 0 ? (
        <>
          <h3>{`共享冲突 (${conflicts.length})`}</h3>
          {conflicts.map((conflict, index) => (
            <div key={`${conflict.name}:${index}`} class="row">
              <span class="k">{conflict.name}</span>
              <span class="pill error">{`需要 ${conflict.requiredVersion} / 提供 ${conflict.provided.join(', ') || '无'}`}</span>
            </div>
          ))}
        </>
      ) : null}

      <h3>{`插件 (${snapshot.availablePlugins.filter((p) => p.enabled).length}/${snapshot.availablePlugins.length})`}</h3>
      {plugins.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        plugins.map((plugin) => (
          <div key={plugin.name} class="row">
            <span class="k" title={plugin.description}>
              {plugin.name}
            </span>
            <span class={`pill ${plugin.enabled ? 'loaded' : ''}`}>{plugin.enabled ? '已启用' : '可用'}</span>
          </div>
        ))
      )}

      <h3>加载指标</h3>
      {metrics.length === 0 ? (
        <div class="muted">（启用 logger 插件后可见）</div>
      ) : (
        metrics.map((metric, index) => (
          <div key={`${metric.entry}:${metric.time}:${index}`} class="row">
            <span class="k" title={`${metric.entry}${metric.host ? ` @${metric.host}` : ''}`}>
              {`加载${kindLabel(metric.kind)}「${prettyEntry(metric.entry)}」`}
            </span>
            <span class={`pill ${metric.status === 'error' ? 'error' : 'loaded'}`}>{ms(metric.durationMs)}</span>
          </div>
        ))
      )}

      <h3>性能</h3>
      {perf.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        perf.map((entry, index) => (
          <div key={`${entry.name}:${index}`} class="row">
            <span class="k" title={entry.name}>
              {perfLabel(entry.name)}
            </span>
            <span class="v">{ms(entry.durationMs)}</span>
          </div>
        ))
      )}

      <h3>事件</h3>
      {events.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        events.map((event, index) => (
          <div key={`${event.time}:${index}`} class="row">
            <span class="k" title={event.type}>
              {event.summary}
            </span>
            <span class="pill">{new Date(event.time).toLocaleTimeString()}</span>
          </div>
        ))
      )}

      <h3>诊断</h3>
      {diagnostics.length === 0 ? (
        <div class="muted">（无）</div>
      ) : (
        diagnostics.map((diagnostic, index) => (
          <div key={`${diagnostic.time}:${index}`} class={`diag ${diagnostic.level}`}>
            <span class="code">{diagnostic.code}</span>
            <span>{` ${diagnostic.message}`}</span>
          </div>
        ))
      )}

      <div class="hint">快捷键 Alt/Option + Shift + L · 拖左侧边可调整宽度</div>
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
    const readBool = () => {
      try {
        return localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    };
    const readWidth = () => {
      try {
        const value = Number(localStorage.getItem(WIDTH_KEY));
        return value >= 240 ? value : DEFAULT_WIDTH;
      } catch {
        return DEFAULT_WIDTH;
      }
    };

    const open = ref(readBool());
    const filter = ref('');
    const width = ref(readWidth());
    const snapshot = ref(buildSnapshot(props.instance));
    let timer: ReturnType<typeof setInterval> | undefined;
    let prevBody: { paddingLeft: string; paddingRight: string; transition: string } | null = null;

    const refresh = () => {
      snapshot.value = buildSnapshot(props.instance);
    };
    const copy = () => {
      try {
        void navigator.clipboard?.writeText(JSON.stringify(snapshot.value, null, 2));
      } catch {
        /* ignore */
      }
    };

    const dock = () => {
      const body = document.body;
      if (!body) {
        return;
      }
      if (!prevBody) {
        prevBody = { paddingLeft: body.style.paddingLeft, paddingRight: body.style.paddingRight, transition: body.style.transition };
      }
      if (open.value) {
        body.style.transition = 'padding .25s ease';
        if (props.position === 'left') {
          body.style.paddingLeft = `${width.value}px`;
          body.style.paddingRight = prevBody.paddingRight;
        } else {
          body.style.paddingRight = `${width.value}px`;
          body.style.paddingLeft = prevBody.paddingLeft;
        }
      } else {
        body.style.paddingLeft = prevBody.paddingLeft;
        body.style.paddingRight = prevBody.paddingRight;
        body.style.transition = prevBody.transition;
      }
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
      dock();
    };
    const close = () => {
      open.value = false;
      syncTimer();
      dock();
    };

    const startResize = (event: PointerEvent) => {
      event.preventDefault();
      const move = (e: PointerEvent) => {
        const raw = props.position === 'left' ? e.clientX : window.innerWidth - e.clientX;
        width.value = Math.max(240, Math.min(Math.min(720, window.innerWidth - 160), raw));
        dock();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        try {
          localStorage.setItem(WIDTH_KEY, String(width.value));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && (event.key === 'L' || event.key === 'l')) {
        event.preventDefault();
        toggle();
      }
    };

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
    watch(open, dock);
    watch(() => props.position, dock);
    syncTimer();

    const hasError = computed(() => getDiagnostics().some((diagnostic) => diagnostic.level === 'error'));

    return () => (
      <div class="host">
        <aside class={['sidebar', props.position, open.value ? 'open' : '']} style={{ width: `${width.value}px` }}>
          <button class={['tab', hasError.value ? 'has-error' : '']} onClick={toggle}>
            <span class="dot" />
            <span class="logo">LinkJS</span>
          </button>
          <div class="handle" onPointerdown={startResize} />
          <div class="content">
            {renderSnapshot(snapshot.value, filter.value, copy, close)}
            <div class="toolbar">
              <input
                placeholder="过滤…"
                value={filter.value}
                onInput={(e: Event) => {
                  filter.value = (e.target as HTMLInputElement).value;
                }}
              />
            </div>
          </div>
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
