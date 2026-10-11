'use strict';

// 后台：检测每个标签页是否加载了 linkjs，只在有 __LINKJS__ 的页面启用（高亮可点）工具栏图标。

const DETECT = () => {
  const api = window.__LINKJS__;
  return Boolean(api && typeof api.getSnapshot === 'function');
};

async function refreshActionState(tabId) {
  if (tabId == null || tabId < 0) {
    return;
  }
  let has = false;
  try {
    // 关键：在页面主世界执行，才能读到页面设置的 window.__LINKJS__（隔离世界读不到）。
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: DETECT, world: 'MAIN' });
    has = Boolean(result && result.result);
  } catch {
    has = false;
  }
  try {
    if (has) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1f6f4a' });
      await chrome.action.setBadgeText({ tabId, text: '●' });
      await chrome.action.enable(tabId);
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.disable(tabId);
    }
  } catch {
    /* 忽略个别标签页的不支持 */
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshActionState(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    void refreshActionState(tabId);
  }
});
