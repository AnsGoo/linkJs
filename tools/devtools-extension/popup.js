'use strict';

// 工具栏弹窗：对当前标签页执行脚本读取 __LINKJS__ 快照，挂载共享 UI。

const READ_SNAPSHOT = () => {
  const api = window.__LINKJS__;
  if (!api || typeof api.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try {
    return JSON.parse(JSON.stringify(api.getSnapshot()));
  } catch (e) {
    return { __state: 'error', message: String((e && e.message) || e) };
  }
};

const RUN_ACTION = (fnName, fnArg) => {
  const api = window.__LINKJS__;
  if (!api || typeof api[fnName] !== 'function') {
    return;
  }
  try {
    fnArg === undefined ? api[fnName]() : api[fnName](fnArg);
  } catch {
    /* ignore */
  }
};

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id != null ? tab.id : null;
}

async function fetchSnapshot() {
  const tabId = await activeTabId();
  if (tabId == null) {
    return { __state: 'missing' };
  }
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: READ_SNAPSHOT });
    return (result && result.result) || { __state: 'missing' };
  } catch (error) {
    return { __state: 'unreachable', message: (error && error.message) || String(error) };
  }
}

async function onAction(op, arg) {
  const tabId = await activeTabId();
  if (tabId == null) {
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: RUN_ACTION, args: [op, arg] });
  } catch {
    /* ignore */
  }
  setTimeout(() => shell.refresh(), 250);
}

const shell = window.LinkJSView.mount(document.getElementById('app'), { fetchSnapshot, onAction });
