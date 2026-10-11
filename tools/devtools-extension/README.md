# LinkJS DevTools Extension

Chrome DevTools 扩展，用于查看并操作被检查页面里 linkjs 的运行时状态：

- 在 **Chrome DevTools** 中新增 “LinkJS” 面板；
- 面板通过 `chrome.devtools.inspectedWindow.eval` 读取页面里的 `window.__LINKJS__.getSnapshot()`（每 1s 刷新）；
- **分区展示**：远程应用 / 共享依赖 / 共享冲突 / 插件 / 加载指标 / 性能 / **事件** / 诊断；
- **文本过滤**、**复制 JSON**、标题显示 `instance.id`（多实例区分）；
- **操作**：每个远程行提供「预取」（`preload`）与「卸载」（`unload` / `unloadLib`）；
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

- 扩展已对齐页内面板的**分区 / 过滤 / 操作**；页内面板（`src/devtools/ui.tsx`）额外支持拖拽调宽、快捷键与实时（非 1s 轮询）刷新。
- 扩展使用 `inspectedWindow.eval`，无需额外 `permissions`；操作按钮即调用页面里的 `__LINKJS__.preload / unload / unloadLib`。
