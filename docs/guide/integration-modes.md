# 集成模式

LinkJS 提供三种消费远程组件的方式，按「谁来渲染、何时加载」区分。

## 对比

| 模式 | API | 谁来渲染 | 何时加载 | 需要构建期配置 |
| --- | --- | --- | --- | --- |
| 路线 B | `createRemoteApp` | 子应用自己的 runtime | 挂载时 | 否 |
| 路线 A · import | `import { X } from '<remote>'` | 宿主 | 挂载时 | 是（`preload`） |
| 路线 A · 工厂 | `createRemoteComponent` | 宿主 | 挂载时 | 否 |
| 运行时 | `loadRemote` / `loadLib` | 宿主 | 手动触发 | 否 |

## 路线 B · `createRemoteApp`

子应用用自己的 runtime 挂载到宿主提供的容器；宿主只提供 DOM 与容器组件。
适合远程是**完整应用**（自带路由/状态），或最强隔离的场景。

```ts
import { createRemoteApp } from 'linkjs/vue';

const RemoteApp = createRemoteApp('remoteApp', {
  shadow: true, // 影子树样式隔离
  // loading / error 可选占位组件，onError 可选回调
});
```

```vue
<RemoteApp msg="hi" :age="20" name="host" sex="male" />
```

- 远端入口需 expose `{ mount, unmount }`。
- 传到组件的 attrs 会透传给远端的 `mount`。
- `shadow: true` 时子应用连同样式挂进影子树（原生 CSS 隔离）。

## 路线 A · 构建期 `import`

宿主直接按远程名静态 import。**仅对在 `consumeTypes.remotes` 中声明了 `preload` 的远程可用**；
未声明 `preload`（lazy）的远程不会生成该虚拟模块，只能用下方的运行时方式。

```ts
import { HelloWorld as RemoteHelloWorld } from 'remoteApp';
import { HelloWorld as RemoteLibHelloWorld } from 'remote-lib';
```

- 插件（`unplugin-linkjs`）把裸说明符解析为虚拟模块，导出 `createRemoteComponent` 包装的组件。
- props 类型来自 `consumeTypes` 生成的远程 `.d.ts`，写错类型编辑器立即报错。

## 路线 A · `createRemoteComponent`

无需构建期配置，一行拿到可用组件（加载 + 隔离 + HMR 重解析内聚）：

```ts
import { createRemoteComponent } from 'linkjs/vue';

const RemoteHelloWorld = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });
```

> 需要 `host` 时由构建期注入（`consumeTypes.remotes` 的 `host`）或显式传入。

## 运行时按需 · `loadRemote` / `loadLib`

懒加载，或远程未开启 `preload` 时使用；拿到组件后用 `<component :is>` 渲染：

```ts
import { loadRemote, loadLib } from 'linkjs';

const comp = await loadRemote('remoteApp/HelloWorld'); // 按注册类型分发 app/lib
const lib = await loadLib('remote-lib/HelloWorld');
```

```vue
<component :is="comp" msg="hi" :age="18" name="host" sex="male" />
```

## 影子树隔离（可选）

路线 A / B 都支持 `shadow: true`。样式在**加载窗口**内被捕获进远程自己的影子树：

- 多远程并发加载时各自归位（按远程入栈）；
- 宿主自渲染内容（`createRemoteComponent` / `LinkjsShadowRoot`）复用同一影子树；
- `Teleport` 到 `body`、`position: fixed` 到视口等会逃出影子树（见后续「Shadow 隔离」页）。

> 运行时 `loadRemote` + `<component :is>` 渲染在宿主 light DOM 时**不要**开 `shadow`，否则样式被捕获进影子树而元素在外部，组件会失去样式。
