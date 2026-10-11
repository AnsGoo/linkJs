'use strict';

// 工具栏弹窗：对当前标签页执行脚本读取 __LINKJS__ 快照并渲染（与页内面板一致）。
// 仅在加载了 linkjs 的页面可用（后台据此 enable/disable 图标）。

const titleEl = document.getElementById('title');
const instanceIdEl = document.getElementById('instance-id');
const sectionsEl = document.getElementById('sections');
const filterEl = document.getElementById('filter');
const copyBtn = document.getElementById('copy');

let snapshot = null;

function readSnapshotInPage() {
  const api = window.__LINKJS__;
  if (!api || typeof api.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try {
    // JSON 往返，确保返回值可序列化（快照里可能含 Error / 非纯对象）。
    return JSON.parse(JSON.stringify(api.getSnapshot()));
  } catch (e) {
    return { __state: 'error', message: String((e && e.message) || e) };
  }
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id != null ? tab.id : null;
}

async function call(op, arg) {
  const tabId = await activeTabId();
  if (tabId == null) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (fnName, fnArg) => {
        const api = window.__LINKJS__;
        if (!api || typeof api[fnName] !== 'function') {
          return;
        }
        try {
          fnArg === undefined ? api[fnName]() : api[fnName](fnArg);
        } catch {
          /* ignore */
        }
      },
      args: [op, arg],
      world: 'MAIN',
    });
  } catch {
    /* ignore */
  }
  setTimeout(render, 250);
}

async function render() {
  const tabId = await activeTabId();
  if (tabId == null) {
    sectionsEl.replaceChildren();
    return;
  }
  let snap = null;
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: readSnapshotInPage, world: 'MAIN' });
    snap = result && result.result;
  } catch {
    snap = null;
  }

  if (!snap || snap.__state === 'missing') {
    instanceIdEl.textContent = '';
    titleEl.classList.remove('has-error');
    snapshot = null;
    sectionsEl.replaceChildren(document.createTextNode('未检测到 linkjs（此页面未在开发模式下初始化）'));
    return;
  }
  if (snap.__state === 'error') {
    sectionsEl.replaceChildren(document.createTextNode('读取失败：' + snap.message));
    return;
  }

  snapshot = snap;
  instanceIdEl.textContent = (snap.instance && snap.instance.id) || '';
  const { hasError } = window.LinkJSView.render(snap, sectionsEl, {
    filter: filterEl.value,
    onAction: call,
    hint: '操作按钮直接作用于当前页面',
  });
  titleEl.classList.toggle('has-error', hasError);
}

filterEl.addEventListener('input', () => {
  if (snapshot) {
    const { hasError } = window.LinkJSView.render(snapshot, sectionsEl, { filter: filterEl.value, onAction: call, hint: '操作按钮直接作用于当前页面' });
    titleEl.classList.toggle('has-error', hasError);
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
