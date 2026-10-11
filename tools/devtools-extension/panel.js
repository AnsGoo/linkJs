'use strict';

// DevTools 面板：经 inspectedWindow.eval 读取被检查页面的 __LINKJS__ 快照并渲染。

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

function draw(snap) {
  instanceIdEl.textContent = (snap.instance && snap.instance.id) || '';
  const { hasError } = window.LinkJSView.render(snap, sectionsEl, {
    filter: filterEl.value,
    onAction: call,
    hint: '拖拽 DevTools 面板边缘可调整宽度 · 操作按钮直接作用于被检查页面',
  });
  titleEl.classList.toggle('has-error', hasError);
}

function render() {
  evalInPage(SNAPSHOT_EXPR, (snap, error) => {
    if (error) {
      instanceIdEl.textContent = '';
      titleEl.classList.remove('has-error');
      sectionsEl.replaceChildren(document.createTextNode('eval error: ' + error));
      return;
    }
    if (!snap || snap.__state === 'missing') {
      instanceIdEl.textContent = '';
      titleEl.classList.remove('has-error');
      snapshot = null;
      sectionsEl.replaceChildren(document.createTextNode('未检测到 linkjs（页面需在开发模式下 createInstance，暴露 window.__LINKJS__）'));
      return;
    }
    if (snap.__state === 'error') {
      sectionsEl.replaceChildren(document.createTextNode('读取失败：' + snap.message));
      return;
    }
    snapshot = snap;
    draw(snap);
  });
}

filterEl.addEventListener('input', () => {
  if (snapshot) {
    draw(snapshot);
  }
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
