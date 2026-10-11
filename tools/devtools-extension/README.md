# LinkJS DevTools Extension

Chrome 扩展（**Vue 3 + Vite** 编写）：在 Chrome DevTools 里提供 “LinkJS” 面板，并在工具栏提供可点图标（仅在加载了 linkjs 的页面高亮可点）。

> 该扩展从仓库里读取 linkjs 运行时快照（`window.__LINKJS__.getSnapshot()`），展示远程应用 / 共享依赖 / 冲突 / 插件 / 指标 / 性能 / 事件 / 诊断，并可对远程执行 `preload / unload`。

## 结构

```
tools/devtools-extension/
├─ panel.html / popup.html      # Vite 入口（会被构建到 dist 根）
├─ src/
│  ├─ panel.ts / popup.ts       # 两个入口的数据源（devtools.eval / chrome.scripting）
│  ├─ App.vue                   # 左侧图标栏(Home/Remote) + 顶栏 + 内容
│  ├─ views/HomeView.vue        # Home：全部分区
│  ├─ views/RemoteView.vue      # Remote：列出 remote，点击看元数据
│  ├─ components/Icon.vue
│  ├─ lib/{types,format}.ts
│  └─ styles.css
├─ public/                      # 原样拷贝到 dist 根
│  ├─ manifest.json             # MV3：devtools_page + action(popup) + background
│  ├─ background.js             # 按页面探测 __LINKJS__，切换彩色/灰色图标
│  ├─ devtools.html / devtools.js
│  └─ icons/                    # 彩色/灰色两套 PNG（scripts/gen-icons.mjs 生成）
├─ scripts/gen-icons.mjs        # 无依赖生成图标
└─ vite.config.ts
```

## 构建

```bash
# 在仓库根目录
pnpm install
pnpm --filter linkjs-devtools-extension build      # 产出 dist/
# 或监听构建
pnpm --filter linkjs-devtools-extension dev
# 重新生成图标（一般无需）
pnpm --filter linkjs-devtools-extension icons
```

## 安装 / 使用

1. `chrome://extensions` → 打开「开发者模式」；
2. 「加载已解压的扩展程序」→ 选择 **`tools/devtools-extension/dist`**（注意是 `dist`）；
3. 打开一个**开发模式**下运行 linkjs 的页面（`createInstance(...)`，dev 会暴露 `window.__LINKJS__`）：
   - 工具栏 **LinkJS** 图标变彩色可点，点击弹出面板；其他页面为灰色不可点；
   - `F12` → DevTools 顶部 **LinkJS** 标签（找不到点 `»`）。
4. 改代码后重新 `build`，再到 `chrome://extensions` 点该扩展的**刷新（↻）**。

## 面板

- 左侧竖向图标栏：**Home**（全部分区）/ **Remote**（列出所有已加载 remote，App+Lib；点击查看元数据与入口、SRI，并可 `预取 / 卸载`）。
- 顶栏：实例 `id`、错误红点、过滤、复制 JSON。

## 权限

- `scripting` + `host_permissions: ["<all_urls>"]`：仅用于按标签页探测/读取 `window.__LINKJS__` 并执行 `preload/unload`；不采集、不外发数据。

## 预览开发

`test/mock.html` 提供一个设置了假 `window.__LINKJS__` 的页面，可离线验证探测/渲染：

```bash
pnpm --filter linkjs-devtools-extension build
python3 -m http.server 4322 --directory tools/devtools-extension
# 浏览器打开 http://localhost:4322/test/mock.html
```
