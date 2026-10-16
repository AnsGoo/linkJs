# ShareRemote

LinkJS **共享依赖协商**演示的远端工程（Vite + Vue app 型远端，dev 端口 `:8091`）。

## 作用

- 加载时通过 `registerShare` 把**自带版本**的共享库 `linkkit@2.0.0` 注入宿主注册表
  （宿主 showcase 另有 `linkkit@1.0.0`）——同名、不同版本、不同 provider。
- 暴露 `NegotiationProbe` 组件，供宿主用 `createRemoteComponent('shareRemote/NegotiationProbe')`
  或 `getRemote('shareRemote/NegotiationProbe')` 消费；探针在**远端内**调用 `loadShare`，
  直观展示「远端拿到的共享实例 = 宿主协商结果」。

## 运行

通常无需单独启动，`pnpm dev:all` 会一并拉起（在 showcase 之前）。

```bash
pnpm --filter ShareRemote dev   # :8091
```

打开 http://localhost:5190/#/share 查看协商页面。
