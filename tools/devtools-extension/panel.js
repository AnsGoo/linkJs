'use strict';

// LinkJS DevTools 面板（扩展版）：移植页内面板（packages/linkjs/src/devtools/ui.tsx）的
// 分区 / 标签 / 过滤 / 复制 / 错误红点 / 远程操作。数据经 inspectedWindow.eval 从页面读取。

const titleEl = document.getElementById('title');
const instanceIdEl = document.getElementById('instance-id');
const sectionsEl = document.getElementById('sections');
const filterEl = document.getElementById('filter');
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

/** 在页面里调用 __LINKJS__ 操作，稍后刷新。 */
function call(op, arg) {
  const expr =
    arg === undefined
      ? `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}()`
      : `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}(${JSON.stringify(arg)})`;
  evalInPage(expr, () => setTimeout(render, 250));
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
      else if (attrs[key] != null && attrs[key] !== false) node.setAttribute(key, attrs[key]);
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

/** 普通行：左 key + 右值。 */
function row(keyText, valueNode, title) {
  return h('div', { class: 'row' }, [h('span', { class: 'k', title: title || keyText }, keyText), valueNode]);
}

/** 带操作按钮的行：左 key + 右侧 actions（状态 + 按钮）。 */
function actionRow(keyText, actionChildren, title) {
  return h('div', { class: 'row' }, [
    h('span', { class: 'k', title: title || keyText }, keyText),
    h('span', { class: 'actions' }, actionChildren),
  ]);
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
  // 性能标签按当前 displayName 动态生成（与页内面板一致）。
  const perfLabel = (name) => {
    if (name.startsWith('linkjs:load:app:')) {
      const [app, ...phaseParts] = name.slice('linkjs:load:app:'.length).split(':');
      const dn = displayByApp.get(app) || app;
      const phase = phaseParts.join(':');
      if (phase === 'fetch') return `拉取入口 HTML「${dn}」`;
      if (phase === 'scripts') return `加载远程脚本「${dn}」`;
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

  const nodes = [];

  // 远程应用（含操作按钮）
  const remoteRows = (snap.remotes || [])
    .filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`))
    .map((r) =>
      actionRow(
        `${r.displayName || r.name}${r.displayName && r.displayName !== r.name ? ` (${r.name})` : ''}${r.type ? ` · ${r.type}` : ''}`,
        [
          pill(r.status || '-', r.status === 'loaded' ? 'loaded' : ''),
          miniButton('预取', '按 manifest 预取资源', () => call('preload', { name: r.name })),
          miniButton('卸载', r.type === 'lib' ? '卸载远程库（清缓存 / 移除资源）' : '卸载远程应用（清缓存 / 移除资源）', () =>
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
        row(
          `${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`,
          pill(`${v.version}${v.loaded ? ' ✓' : ''}`, v.loaded ? 'loaded' : ''),
        ),
      ),
  );
  nodes.push(...section('共享依赖', shareRows));

  // 共享冲突
  const conflictRows = (snap.conflicts || [])
    .filter((c) => match(`${c.name} ${c.requiredVersion}`))
    .map((c) => row(c.name, pill(`需要 ${c.requiredVersion} / 提供 ${(c.provided || []).join(', ') || '无'}`, 'error')));
  if (conflictRows.length) {
    nodes.push(...section(`共享冲突 (${conflictRows.length})`, conflictRows));
  }

  // 插件
  const allPlugins = snap.availablePlugins || [];
  const pluginRows = allPlugins
    .filter((p) => show(p.name))
    .map((p) => row(p.name, pill(p.enabled ? '已启用' : '可用', p.enabled ? 'loaded' : ''), p.description));
  nodes.push(...section(`插件 (${allPlugins.filter((p) => p.enabled).length}/${allPlugins.length})`, pluginRows));

  // 加载指标
  const metricRows = (snap.metrics || [])
    .filter((m) => match(`${m.entry} ${m.status} ${m.host || ''}`))
    .slice(-12)
    .reverse()
    .map((m) => row(`加载${kindLabel(m.kind)}「${prettyEntry(m.entry)}」`, pill(ms(m.durationMs), m.status === 'error' ? 'error' : 'loaded')));
  nodes.push(...section('加载指标', metricRows));

  // 性能
  const perfRows = (snap.perf || [])
    .filter((p) => show(p.name))
    .slice(-12)
    .reverse()
    .map((p) => row(perfLabel(p.name), h('span', { class: 'v' }, ms(p.durationMs)), p.name));
  nodes.push(...section('性能', perfRows));

  // 事件
  const eventRows = (snap.events || [])
    .filter((e) => match(`${e.type} ${e.summary}`))
    .slice(-20)
    .reverse()
    .map((e) => row(e.summary, pill(timeStr(e.time)), e.type));
  nodes.push(...section('事件', eventRows));

  // 诊断
  const diagRows = (snap.diagnostics || [])
    .filter((d) => match(`${d.code} ${d.message}`))
    .slice(-20)
    .reverse()
    .map((d) => {
      const line = h('div', { class: 'diag' + (d.level === 'error' ? ' error' : '') }, [
        h('span', { class: 'code' }, d.code),
        document.createTextNode(' ' + d.message),
        ' ',
        pill(timeStr(d.time)),
      ]);
      return line;
    });
  nodes.push(...section('诊断', diagRows));

  nodes.push(h('div', { class: 'hint' }, '拖拽 DevTools 面板边缘可调整宽度 · 操作按钮直接作用于被检查页面'));

  sectionsEl.replaceChildren(...nodes);

  // 错误红点
  const hasError = (snap.diagnostics || []).some((d) => d.level === 'error');
  titleEl.classList.toggle('has-error', hasError);
}

function render() {
  evalInPage(SNAPSHOT_EXPR, (snap, error) => {
    if (error) {
      instanceIdEl.textContent = '';
      sectionsEl.replaceChildren(h('div', { class: 'muted' }, 'eval error: ' + error));
      return;
    }
    if (!snap || snap.__state === 'missing') {
      instanceIdEl.textContent = '';
      titleEl.classList.remove('has-error');
      snapshot = null;
      sectionsEl.replaceChildren(h('div', { class: 'muted' }, '未检测到 linkjs（页面需在开发模式下初始化 createInstance，暴露 window.__LINKJS__）'));
      return;
    }
    if (snap.__state === 'error') {
      sectionsEl.replaceChildren(h('div', { class: 'muted' }, '读取失败：' + snap.message));
      return;
    }
    snapshot = snap;
    instanceIdEl.textContent = (snap.instance && snap.instance.id) || '';
    renderSections(snap);
  });
}

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
