import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import type { Source } from './common/types';

// DevTools 面板数据源：经 inspectedWindow.eval 读取被检查页面的 __LINKJS__。

const SNAPSHOT_EXPR = `(() => {
  if (!window.__LINKJS__ || typeof window.__LINKJS__.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try { return window.__LINKJS__.getSnapshot(); }
  catch (e) { return { __state: 'error', message: String((e && e.message) || e) }; }
})()`;

const source: Source = {
  fetchSnapshot: () =>
    new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(SNAPSHOT_EXPR, (result: unknown, exceptionInfo: any) => {
        if (exceptionInfo) {
          resolve({ __state: 'unreachable', message: (exceptionInfo && exceptionInfo.value) || String(exceptionInfo) });
        } else {
          resolve(result as never);
        }
      });
    }),
  onAction: (op, arg) => {
    const expr =
      arg === undefined
        ? `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}()`
        : `window.__LINKJS__ && window.__LINKJS__.${op} && window.__LINKJS__.${op}(${JSON.stringify(arg)})`;
    chrome.devtools.inspectedWindow.eval(expr, () => {});
  },
};

createApp(App, { source }).mount('#app');
