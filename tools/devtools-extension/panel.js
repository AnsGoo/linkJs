'use strict';

// 在“被检查页面”的上下文里读取 LinkJS 快照并渲染（分区 / 过滤 / 操作）。
// 依赖页面已加载 linkjs（其会暴露全局 __LINKJS__）。

const statusEl = document.getElementById('status');
const sectionsEl = document.getElementById('sections');
const filterEl = document.getElementById('filter');
const refreshBtn = document.getElementById('refresh');
const copyBtn = document.getElementById('copy');

let snapshot = null;

const SNAPSHOT_EXPR = `(() => {
  if (!window.__LINKJS__ || typeof window.__LINKJS__.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try { return window.__LINKJS__.getSnapshot(); }
  catch (e) { return { __state: 'error', message: String((e && e.message) || e) }; }
})()`;

function evalInPage(expr, cb) {
  chrome.devtools.inspectedWindow.eval(expr, (result, exceptionInfo) => {
    if (exceptionInfo) {
      cb(null, (exceptionInfo && exceptionInfo.value) || String(exceptionInfo));
      return;
    }
    cb(result, null);
  });
}

/** 在页面里调用 __LINKJS__ 的操作方法，稍后刷新。 */
function call(op, arg) {
  const expr =
    arg === undefined
      ? `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}()`
      : `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}(${JSON.stringify(arg)})`;
  evalInPage(expr, () => setTimeout(render, 200));
}

function ms(value) {
  const n = Number(value) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

function kindLabel(kind) {
  return kind === 'lib' ? '库' : kind === 'remote' ? '远程' : '应用';
}

function timeStr(time) {
  try {
    return new Date(time).toLocaleTimeString();
  } catch {
    return '';
  }
}

function h(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key in attrs) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'onClick') node.addEventListener('click', attrs[key]);
      else if (key === 'title') node.title = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
  }
  for (const child of [].concat(children || [])) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function pill(text, cls) {
  return h('span', { class: 'pill' + (cls ? ' ' + cls : '') }, text);
}

function miniButton(label, title, onClick) {
  return h('button', { class: 'mini', title, onClick }, label);
}

function row(keyText, valueChildren, title) {
  return h('div', { class: 'row' }, [h('span', { class: 'k', title: title || keyText }, keyText), h('span', { class: 'actions' }, valueChildren)]);
}

function section(title, rows) {
  return [h('h3', null, title), rows.length ? rows : h('div', { class: 'muted' }, '（无）')];
}

function renderSections(snap) {
  const q = (filterEl.value || '').trim().toLowerCase();
  const match = (text) => !q || String(text).toLowerCase().includes(q);
  const show = (text) => !q || String(text).toLowerCase().includes(q);

  const displayByApp = new Map((snap.remotes || []).map((r) => [r.name, r.displayName || r.name]));
  const prettyEntry = (entry) => {
    const parts = String(entry).split('/');
    parts[0] = displayByApp.get(parts[0]) || parts[0];
    return parts.join('/');
  };

  const nodes = [];

  // 远程应用（带操作按钮）
  const remoteRows = (snap.remotes || [])
    .filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`))
    .map((r) =>
      row(
        `${r.displayName || r.name}${r.displayName && r.displayName !== r.name ? ` (${r.name})` : ''}${r.type ? ` · ${r.type}` : ''}`,
        [
          pill(r.status || '-', r.status === 'loaded' ? 'loaded' : ''),
          miniButton('预取', '按 manifest 预取资源', () => call('preload', { name: r.name })),
          miniButton('卸载', r.type === 'lib' ? '卸载远程库' : '卸载远程应用', () =>
            r.type === 'lib' ? call('unloadLib', r.name) : call('unload', r.name),
          ),
        ],
        `${r.name}${r.host ? ` @${r.host}` : ''}`,
      ),
    );
  nodes.push(...section('远程应用', remoteRows));

  // 共享依赖
  const shareRows = (snap.shares || []).flatMap((share) =>
    share.versions
      .filter((v) => match(`${share.name} ${share.scope} ${v.version}`))
      .map((v) =>
        row(`${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`, [
          pill(`${v.version}${v.loaded ? ' ✓' : ''}`, v.loaded ? 'loaded' : ''),
        ]),
      ),
  );
  nodes.push(...section('共享依赖', shareRows));

  // 共享冲突
  const conflictRows = (snap.conflicts || [])
    .filter((c) => match(`${c.name} ${c.requiredVersion}`))
    .map((c) => row(c.name, [pill(`需要 ${c.requiredVersion} / 提供 ${(c.provided || []).join(', ') || '无'}`, 'error')]));
  nodes.push(...section(`共享冲突 (${conflictRows.length})`, conflictRows));

  // 插件
  const pluginRows = (snap.availablePlugins || [])
    .filter((p) => show(p.name))
    .map((p) => row(p.name, [pill(p.enabled ? '已启用' : '可用', p.enabled ? 'loaded' : '')], p.description));
  nodes.push(...section(`插件 (${(snap.availablePlugins || []).filter((p) => p.enabled).length}/${(snap.availablePlugins || []).length})`, pluginRows));

  // 加载指标
  const metricRows = (snap.metrics || [])
    .filter((m) => match(`${m.entry} ${m.status} ${m.host || ''}`))
    .slice(-12)
    .reverse()
    .map((m) => row(`加载${kindLabel(m.kind)}「${prettyEntry(m.entry)}」`, [pill(ms(m.durationMs), m.status === 'error' ? 'error' : 'loaded')]));
  nodes.push(...section('加载指标', metricRows));

  // 性能
  const perfRows = (snap.perf || [])
    .filter((p) => show(p.name))
    .slice(-12)
    .reverse()
    .map((p) => row(p.name, [h('span', { class: 'pill' }, ms(p.durationMs))]));
  nodes.push(...section('性能', perfRows));

  // 事件
  const eventRows = (snap.events || [])
    .filter((e) => match(`${e.type} ${e.summary}`))
    .slice(-20)
    .reverse()
    .map((e) => row(e.summary, [pill(timeStr(e.time))], e.type));
  nodes.push(...section('事件', eventRows));

  // 诊断
  const diagRows = (snap.diagnostics || [])
    .filter((d) => match(`${d.code} ${d.message}`))
    .slice(-20)
    .reverse()
    .map((d) => row(`${d.code} ${d.message}`, [pill(timeStr(d.time), d.level === 'error' ? 'error' : '')]));
  nodes.push(...section('诊断', diagRows));

  sectionsEl.replaceChildren(...nodes);
}

function render() {
  evalInPage(SNAPSHOT_EXPR, (snap, error) => {
    if (error) {
      statusEl.textContent = 'eval error';
      return;
    }
    if (!snap || snap.__state === 'missing') {
      statusEl.textContent = '未检测到 linkjs（window.__LINKJS__ 不存在）';
      sectionsEl.replaceChildren();
      snapshot = null;
      return;
    }
    if (snap.__state === 'error') {
      statusEl.textContent = '读取失败：' + snap.message;
      return;
    }
    snapshot = snap;
    statusEl.textContent = `已连接 · ${snap.instance && snap.instance.id ? snap.instance.id : ''}`;
    renderSections(snap);
  });
}

refreshBtn.addEventListener('click', render);
filterEl.addEventListener('input', () => {
  if (snapshot) renderSections(snapshot);
});
copyBtn.addEventListener('click', () => {
  if (snapshot) {
    try {
      navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    } catch {
      /* ignore */
    }
  }
});

render();
setInterval(render, 1000);
