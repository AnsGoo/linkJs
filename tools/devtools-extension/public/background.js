'use strict';

// 后台：检测标签页是否加载了 linkjs，据此启用/置灰工具栏图标。
// - 有 linkjs：启用（可点）+ 绿色徽标 ●
// - 明确没有（注入成功但无 __LINKJS__）：置灰不可点
// - 无法判断（注入失败/无网站权限/chrome:// 等）：fail-open 保持可点，避免“点不动”

const DETECT = () =>
  Boolean(window.__LINKJS__ && typeof window.__LINKJS__.getSnapshot === 'function');

// 两套图标：检测到 linkjs 用彩色，其他用灰色。
const ICON_ON = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};
const ICON_OFF = {
  16: 'icons/icon-off-16.png',
  32: 'icons/icon-off-32.png',
  48: 'icons/icon-off-48.png',
  128: 'icons/icon-off-128.png',
};

async function refreshActionState(tabId) {
  if (tabId == null || tabId < 0) {
    return;
  }
  let known = false;
  let has = false;
  try {
    // 关键：主世界执行，才能读到页面设置的 window.__LINKJS__（隔离世界读不到）。
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: DETECT, world: 'MAIN' });
    has = Boolean(result && result.result);
    known = true;
  } catch (error) {
    known = false;
    console.debug('[linkjs] 探测失败（可能缺少网站访问权限）:', error && error.message);
  }

  try {
    if (known && has) {
      await chrome.action.setIcon({ tabId, path: ICON_ON });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1f6f4a' });
      await chrome.action.setBadgeText({ tabId, text: '●' });
      await chrome.action.enable(tabId);
    } else if (known && !has) {
      await chrome.action.setIcon({ tabId, path: ICON_OFF });
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.disable(tabId);
    } else {
      // fail-open：无法判断时保持可点（弹窗内会给出原因）。
      await chrome.action.setIcon({ tabId, path: ICON_OFF });
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.enable(tabId);
    }
  } catch (error) {
    console.debug('[linkjs] 更新图标状态失败:', error && error.message);
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
chrome.runtime.onInstalled.addListener(() => {
  console.debug('[linkjs] background installed');
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab && tab.id != null) {
      void refreshActionState(tab.id);
    }
  });
});
