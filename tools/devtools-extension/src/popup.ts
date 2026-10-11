import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import type { Source } from './common/types';

// 工具栏弹窗数据源：对当前标签页执行脚本（主世界）读取 __LINKJS__。

const READ_SNAPSHOT = () => {
  const api = (window as any).__LINKJS__;
  if (!api || typeof api.getSnapshot !== 'function') {
    return { __state: 'missing' };
  }
  try {
    return JSON.parse(JSON.stringify(api.getSnapshot()));
  } catch (e) {
    return { __state: 'error', message: String((e && (e as Error).message) || e) };
  }
};

const RUN_ACTION = (fnName: string, fnArg: unknown) => {
  const api = (window as any).__LINKJS__;
  if (!api || typeof api[fnName] !== 'function') {
    return;
  }
  try {
    if (fnArg === undefined) {
      api[fnName]();
    } else {
      api[fnName](fnArg);
    }
  } catch {
    /* ignore */
  }
};

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id != null ? tab.id : null;
}

const source: Source = {
  fetchSnapshot: async () => {
    const tabId = await activeTabId();
    if (tabId == null) {
      return { __state: 'missing' };
    }
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: READ_SNAPSHOT });
      return (result && result.result) || { __state: 'missing' };
    } catch (error) {
      return { __state: 'unreachable', message: (error as Error)?.message || String(error) };
    }
  },
  onAction: async (op, arg) => {
    const tabId = await activeTabId();
    if (tabId == null) {
      return;
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: RUN_ACTION, args: [op, arg] });
    } catch {
      /* ignore */
    }
  },
};

createApp(App, { source }).mount('#app');
