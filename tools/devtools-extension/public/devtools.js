// 注册 DevTools 面板（“LinkJS” 标签页）。devtools.js 在每次打开 DevTools 时执行。
try {
  chrome.devtools.panels.create('LinkJS', 'icons/icon-32.png', 'panel.html', (panel) => {
    console.debug('[linkjs] DevTools 面板已注册:', panel);
  });
} catch (error) {
  console.error('[linkjs] 注册 DevTools 面板失败:', error);
}
