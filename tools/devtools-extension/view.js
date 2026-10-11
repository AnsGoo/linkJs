'use strict';

// 共享视图（Vue DevTools 风格）：左侧竖向图标栏（Home / Remote）+ 内容区。
// - Home：现有全部分区（远程应用/共享依赖/冲突/插件/指标/性能/事件/诊断）
// - Remote：列出所有已加载 remote（app + lib），点击查看其元数据
// 由 DevTools 面板（panel.js）与工具栏弹窗（popup.js）共用，仅数据来源不同。

(function () {
  // ---- DOM 辅助 ----
  function appendChildren(node, children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) appendChildren(node, child);
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
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
    appendChildren(node, [children]);
    return node;
  }

  function iconSvg(svg) {
    const span = document.createElement('span');
    span.className = 'ico';
    span.innerHTML = svg;
    return span;
  }

  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>',
    remote: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/></svg>',
  };

  function pill(text, cls) {
    return h('span', { class: 'pill' + (cls ? ' ' + cls : '') }, text);
  }

  function miniButton(label, title, onClick) {
    return h('button', { class: 'mini', title, onClick }, label);
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

  function row(keyText, valueNode, title) {
    return h('div', { class: 'row' }, [h('span', { class: 'k', title: title || keyText }, keyText), valueNode]);
  }

  function actionRow(keyText, actionChildren, title) {
    return h('div', { class: 'row' }, [
      h('span', { class: 'k', title: title || keyText }, keyText),
      h('span', { class: 'actions' }, actionChildren),
    ]);
  }

  function section(title, rows) {
    const heading = h('h3', null, title);
    const body = rows.length ? rows : [h('div', { class: 'muted' }, '（无）')];
    return [heading, ...body];
  }

  // ---- Home 视图 ----
  function overviewNodes(snap, filter, onAction) {
    const q = (filter || '').trim().toLowerCase();
    const match = (text) => !q || String(text).toLowerCase().includes(q);
    const show = (text) => !q || String(text).toLowerCase().includes(q);

    const displayByApp = new Map((snap.remotes || []).map((r) => [r.name, r.displayName || r.name]));
    const prettyEntry = (entry) => {
      const parts = String(entry).split('/');
      parts[0] = displayByApp.get(parts[0]) || parts[0];
      return parts.join('/');
    };
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

    const remoteRows = (snap.remotes || [])
      .filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`))
      .map((r) =>
        actionRow(
          `${r.displayName || r.name}${r.displayName && r.displayName !== r.name ? ` (${r.name})` : ''}${r.type ? ` · ${r.type}` : ''}`,
          [
            pill(r.status || '-', r.status === 'loaded' ? 'loaded' : ''),
            miniButton('预取', '按 manifest 预取资源', () => onAction('preload', { name: r.name })),
            miniButton('卸载', r.type === 'lib' ? '卸载远程库' : '卸载远程应用', () =>
              r.type === 'lib' ? onAction('unloadLib', r.name) : onAction('unload', r.name),
            ),
          ],
          `${r.name}${r.host ? ` @${r.host}` : ''}`,
        ),
      );
    nodes.push(...section('远程应用', remoteRows));

    const shareRows = (snap.shares || []).flatMap((share) =>
      share.versions
        .filter((v) => match(`${share.name} ${share.scope} ${v.version}`))
        .map((v) => row(`${share.name}${share.scope !== 'global' ? ` @${share.scope}` : ''}`, pill(`${v.version}${v.loaded ? ' ✓' : ''}`, v.loaded ? 'loaded' : ''))),
    );
    nodes.push(...section('共享依赖', shareRows));

    const conflictRows = (snap.conflicts || [])
      .filter((c) => match(`${c.name} ${c.requiredVersion}`))
      .map((c) => row(c.name, pill(`需要 ${c.requiredVersion} / 提供 ${(c.provided || []).join(', ') || '无'}`, 'error')));
    if (conflictRows.length) nodes.push(...section(`共享冲突 (${conflictRows.length})`, conflictRows));

    const allPlugins = snap.availablePlugins || [];
    const pluginRows = allPlugins.filter((p) => show(p.name)).map((p) => row(p.name, pill(p.enabled ? '已启用' : '可用', p.enabled ? 'loaded' : ''), p.description));
    nodes.push(...section(`插件 (${allPlugins.filter((p) => p.enabled).length}/${allPlugins.length})`, pluginRows));

    const metricRows = (snap.metrics || [])
      .filter((m) => match(`${m.entry} ${m.status} ${m.host || ''}`))
      .slice(-12)
      .reverse()
      .map((m) => row(`加载${kindLabel(m.kind)}「${prettyEntry(m.entry)}」`, pill(ms(m.durationMs), m.status === 'error' ? 'error' : 'loaded')));
    nodes.push(...section('加载指标', metricRows));

    const perfRows = (snap.perf || [])
      .filter((p) => show(p.name))
      .slice(-12)
      .reverse()
      .map((p) => row(perfLabel(p.name), h('span', { class: 'v' }, ms(p.durationMs)), p.name));
    nodes.push(...section('性能', perfRows));

    const eventRows = (snap.events || [])
      .filter((e) => match(`${e.type} ${e.summary}`))
      .slice(-20)
      .reverse()
      .map((e) => row(e.summary, pill(timeStr(e.time)), e.type));
    nodes.push(...section('事件', eventRows));

    const diagRows = (snap.diagnostics || [])
      .filter((d) => match(`${d.code} ${d.message}`))
      .slice(-20)
      .reverse()
      .map((d) =>
        h('div', { class: 'diag' + (d.level === 'error' ? ' error' : '') }, [h('span', { class: 'code' }, d.code), document.createTextNode(' ' + d.message), ' ', pill(timeStr(d.time))]),
      );
    nodes.push(...section('诊断', diagRows));

    return nodes;
  }

  // ---- Remote 视图：列表 ----
  function remoteListNodes(snap, filter, selected, onSelect) {
    const q = (filter || '').trim().toLowerCase();
    const match = (text) => !q || String(text).toLowerCase().includes(q);
    const remotes = (snap.remotes || []).filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`));

    const nodes = [];
    if (!remotes.length) {
      nodes.push(h('div', { class: 'muted' }, '（无）'));
      return nodes;
    }
    nodes.push(
      h('h3', null, `已加载远程 (${remotes.length})`),
      ...remotes.map((r) =>
        h(
          'button',
          {
            class: 'remote-item' + (selected === r.name ? ' active' : ''),
            onClick: () => onSelect(r.name),
          },
          [
            h('span', { class: 'rk' }, `${r.displayName || r.name}${r.displayName && r.displayName !== r.name ? ` (${r.name})` : ''}`),
            h('span', { class: 'rt' }, `${r.type || '-'} · ${r.host || '-'}`),
            pill(r.status || '-', r.status === 'loaded' ? 'loaded' : ''),
          ],
        ),
      ),
    );
    return nodes;
  }

  // ---- Remote 视图：元数据 ----
  function entryRows(entry) {
    if (entry == null) return [];
    if (typeof entry === 'string') return [row('entry', h('span', { class: 'v' }, entry))];
    return Object.keys(entry).map((key) => row(`entry.${key}`, h('span', { class: 'v' }, String(entry[key]))));
  }

  function remoteDetailNodes(remote, onAction, onBack) {
    const nodes = [];
    nodes.push(h('div', { class: 'detail-head' }, miniButton('← 返回', '返回列表', onBack), h('strong', null, `${remote.displayName || remote.name}`)));
    const meta = [
      ['name', remote.name],
      ['displayName', remote.displayName],
      ['type', remote.type],
      ['status', remote.status],
      ['host', remote.host],
      ['version', remote.version],
      ['shareScope', remote.shareScope && remote.shareScope.length ? remote.shareScope.join(', ') : undefined],
    ];
    nodes.push(h('h3', null, '元数据'));
    for (const [k, v] of meta) {
      if (v !== undefined && v !== null && v !== '') nodes.push(row(k, h('span', { class: 'v' }, String(v))));
    }
    nodes.push(...entryRows(remote.entry));
    if (remote.integrity && typeof remote.integrity === 'object') {
      const keys = Object.keys(remote.integrity);
      nodes.push(row('integrity', h('span', { class: 'v' }, `${keys.length} 项`), keys.join('\n')));
      for (const key of keys) nodes.push(row(`  ${key}`, h('span', { class: 'v' }, String(remote.integrity[key]))));
    }
    nodes.push(
      h('h3', null, '操作'),
      h('div', { class: 'row' }, [
        h('span', { class: 'k' }, 'preload / unload'),
        h('span', { class: 'actions' }, [
          miniButton('预取', '按 manifest 预取资源', () => onAction('preload', { name: remote.name })),
          miniButton('卸载', remote.type === 'lib' ? '卸载远程库' : '卸载远程应用', () => (remote.type === 'lib' ? onAction('unloadLib', remote.name) : onAction('unload', remote.name))),
        ]),
      ]),
    );
    return nodes;
  }

  /**
   * 挂载完整 UI（图标栏 + 顶栏 + 内容）。
   * @param {HTMLElement} root 容器
   * @param {{ fetchSnapshot: () => Promise<object>, onAction: (op: string, arg?: unknown) => void }} source
   * @returns {{ refresh: () => Promise<void>, destroy: () => void }}
   */
  function mount(root, source) {
    let tab = 'home';
    let filter = '';
    let selectedRemote = null;
    let snapshot = null;
    let timer = null;

    // 图标栏
    const railHome = h('button', { class: 'tab-btn active', title: 'Home', onClick: () => selectTab('home') }, iconSvg(ICONS.home));
    const railRemote = h('button', { class: 'tab-btn', title: 'Remote', onClick: () => selectTab('remote') }, iconSvg(ICONS.remote));
    const rail = h('div', { class: 'rail' }, [railHome, railRemote]);

    // 顶栏
    const idEl = h('span', { class: 'id' });
    const dotEl = h('span', { class: 'dot', title: '存在 error 诊断' });
    const titleText = h('span', { class: 'title' }, [h('span', { class: 'brand' }, 'LinkJS'), idEl]);
    const filterInput = h('input', { class: 'filter', name: 'linkjs-filter', 'aria-label': '过滤', placeholder: '过滤…', onInput: (e) => { filter = e.target.value; renderContent(); } });
    const copyBtn = miniButton('复制 JSON', '复制当前快照 JSON', () => { if (snapshot) { try { navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2)); } catch {} } });
    const topbar = h('div', { class: 'topbar' }, [titleText, filterInput, copyBtn, dotEl]);

    const content = h('div', { class: 'content' });
    const main = h('div', { class: 'main' }, [topbar, content]);
    const app = h('div', { class: 'linkjs-app' }, [rail, main]);
    root.replaceChildren(app);

    function selectTab(next) {
      tab = next;
      selectedRemote = null;
      railHome.classList.toggle('active', tab === 'home');
      railRemote.classList.toggle('active', tab === 'remote');
      filterInput.style.display = '';
      renderContent();
    }

    function renderContent() {
      if (!snapshot || snapshot.__state) {
        content.replaceChildren(h('div', { class: 'muted' }, stateMessage(snapshot)));
        return;
      }
      if (tab === 'home') {
        content.replaceChildren(...overviewNodes(snapshot, filter, source.onAction));
      } else if (selectedRemote) {
        const remote = (snapshot.remotes || []).find((r) => r.name === selectedRemote);
        if (!remote) {
          selectedRemote = null;
          content.replaceChildren(...remoteListNodes(snapshot, filter, null, selectRemote));
        } else {
          content.replaceChildren(...remoteDetailNodes(remote, source.onAction, () => { selectedRemote = null; renderContent(); }));
        }
      } else {
        content.replaceChildren(...remoteListNodes(snapshot, filter, selectedRemote, selectRemote));
      }
    }

    function selectRemote(name) {
      selectedRemote = name;
      renderContent();
    }

    function stateMessage(snap) {
      if (!snap) return '未检测到 linkjs';
      if (snap.__state === 'missing') return '此页面未检测到 linkjs（需在开发模式下 createInstance，暴露 window.__LINKJS__）';
      if (snap.__state === 'unreachable') return '无法访问当前页面：' + (snap.message || '') + '\n请在 chrome://extensions 将“网站访问权限”设为“在所有网站上”。';
      if (snap.__state === 'error') return '读取失败：' + (snap.message || '');
      return '未检测到 linkjs';
    }

    async function refresh() {
      let snap = null;
      try {
        snap = await source.fetchSnapshot();
      } catch (error) {
        snap = { __state: 'unreachable', message: (error && error.message) || String(error) };
      }
      snapshot = snap || { __state: 'missing' };
      const ok = !snapshot.__state;
      idEl.textContent = ok && snapshot.instance ? snapshot.instance.id : '';
      const hasError = ok && (snapshot.diagnostics || []).some((d) => d.level === 'error');
      topbar.classList.toggle('has-error', hasError);
      filterInput.style.display = ok ? '' : 'none';
      copyBtn.style.display = ok ? '' : 'none';
      renderContent();
    }

    void refresh();
    timer = setInterval(() => void refresh(), 1000);

    return {
      refresh,
      destroy() {
        if (timer) clearInterval(timer);
      },
    };
  }

  window.LinkJSView = { mount };
})();
