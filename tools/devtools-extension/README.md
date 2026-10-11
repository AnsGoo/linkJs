# LinkJS DevTools Extension

Chrome 扩展，用于查看并操作被检查页面里 linkjs 的运行时状态。提供两种入口：

1. **工具栏弹窗**（`action` popup）：**只在加载了 linkjs 的页面启用（高亮可点）**，其他页面图标置灰不可点。点击图标即弹出面板。
2. **DevTools 面板**：在开发者工具里新增 “LinkJS” 标签（内容依赖被检查页面有 `window.__LINKJS__`）。

## 面板内容（与页内面板 `packages/linkjs/src/devtools/ui.tsx` 对齐）

- 分区：远程应用 / 共享依赖 / 共享冲突 / 插件 / 加载指标 / 性能 / 事件 / 诊断；
- 顶部：`instance.id`、错误红点、`复制 JSON`、文本过滤；
- 远程行操作：**预取**（`preload`）、**卸载**（`unload` / `unloadLib`）；
- 标签按 `displayName` 动态生成（性能/指标与展示名一致）。

## 安装与使用

1. Chrome 打开 `chrome://extensions` → 打开右上角「开发者模式」；
2. 「加载已解压的扩展程序」→ 选择本目录 `tools/devtools-extension`；
3. 打开一个**开发模式**下运行 linkjs 的页面（`createInstance(...)`，dev 会自动暴露 `window.__LINKJS__`）：
   - 工具栏 **LinkJS** 图标此时会**高亮可点**，点击弹出面板；
   - 或 `F12` 打开 DevTools，切到 **LinkJS** 标签（找不到就点 `»` 溢出菜单）；
4. 其他未加载 linkjs 的页面：图标**置灰不可点**，DevTools 面板显示「未检测到 linkjs」。

> 修改扩展代码后，在 `chrome://extensions` 点该扩展卡片的**刷新（↻）**即可生效。

## 权限说明

- `scripting` + `host_permissions: ["<all_urls>"]`：用于在切换标签时探测 `window.__LINKJS__`（决定图标是否启用），以及弹窗/操作在页面上下文中读取快照、调用 `preload/unload`。**不采集也不外发任何数据**。
- 面板只读取 `window.__LINKJS__.getSnapshot()`；操作按钮即调用 `__LINKJS__.preload / unload / unloadLib`。

## 结构

- `manifest.json`：MV3，`devtools_page` + `action` popup + `background` service worker；
- `background.js`：按标签页探测 `__LINKJS__`，`chrome.action.enable/disable` + 徽标；
- `view.js` / `view.css`：共享渲染（页面面板与弹窗共用）；
- `popup.html` / `popup.js`：工具栏弹窗（`chrome.scripting` 读取/操作当前标签页）；
- `panel.html` / `panel.js`：DevTools 面板（`devtools.inspectedWindow.eval`）；
- `devtools.html` / `devtools.js`：注册 “LinkJS” DevTools 面板。
