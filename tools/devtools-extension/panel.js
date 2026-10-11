'use strict';

// DevTools 面板：经 inspectedWindow.eval 读取被检查页面的 __LINKJS__ 快照，挂载共享 UI。

const SNAPSHOT_EXPR = `(() => {
  if (!window.__LINKJS__ || typeof window.__LINKJS__.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try { return window.__LINKJS__.getSnapshot(); }
  catch (e) { return { __state: 'error', message: String((e && e.message) || e) }; }
})()`;

function fetchSnapshot() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(SNAPSHOT_EXPR, (result, exceptionInfo) => {
      if (exceptionInfo) {
        resolve({ __state: 'unreachable', message: (exceptionInfo && exceptionInfo.value) || String(exceptionInfo) });
        return;
      }
      resolve(result);
    });
  });
}

function onAction(op, arg) {
  const expr =
    arg === undefined
      ? `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}()`
      : `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}(${JSON.stringify(arg)})`;
  chrome.devtools.inspectedWindow.eval(expr, () => setTimeout(() => shell.refresh(), 250));
}

const shell = window.LinkJSView.mount(document.getElementById('app'), { fetchSnapshot, onAction });
