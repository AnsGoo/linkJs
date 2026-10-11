# LinkJS DevTools Extension

一个最小可用的 Chrome DevTools 扩展，用于查看被检查页面里 linkjs 的运行时状态：

- 在 **Chrome DevTools** 中新增 “LinkJS” 面板；
- 面板通过 `chrome.devtools.inspectedWindow.eval` 读取页面里的 `window.__LINKJS__.getSnapshot()` 并展示（每 1s 刷新）；
- 依赖页面已加载 linkjs（开发模式下会暴露全局 `__LINKJS__`）。

## 使用

1. 打开 Chrome：`chrome://extensions` → 打开右上角「开发者模式」；
2. 「加载已解压的扩展程序」→ 选择本目录 `tools/devtools-extension`；
3. 打开你的应用页面 → 打开 DevTools（F12）→ 顶部会出现 **LinkJS** 标签页；
4. 若显示「未检测到 linkjs」，确认应用已通过 `createInstance` 初始化且处于开发模式。

## 结构

- `manifest.json`：MV3，声明 `devtools_page`；
- `devtools.html` / `devtools.js`：注册面板；
- `panel.html` / `panel.js`：读取并渲染 `__LINKJS__` 快照。

## 备注

- 本扩展只做「读取展示」；页内已内置的可视化侧边栏（`src/devtools/ui.tsx`）功能更完整（过滤 / 复制 / 调整宽度 / 指标 / 性能 / 冲突）。
- 扩展使用 `inspectedWindow.eval`，无需额外 `permissions`。
