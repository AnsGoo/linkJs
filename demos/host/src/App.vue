<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { createRemoteApp, createRemoteComponent } from 'linkjs/vue';

const RemoteApp = createRemoteApp('remoteApp', { shadow: true, host: 'http://localhost:8081' });

// 路线 A：一行拿到可直接使用的远程组件，内部自动加载 + 影子树隔离 + HMR 重解析，
// 无需再手动包一层 `<LinkjsShadowRoot>`。
// 类型转发：`consumeTypes` 生成类型后，`createRemoteComponent` 按 entry 推导远程组件 props
// （msg/age/name/sex/tst …），删/改必填 prop 或传错类型，编辑器会立即报错。
const RemoteHelloWorld = createRemoteComponent('remoteApp/HelloWorld', {
  shadow: true,
  host: 'http://localhost:8081',
});
const RemoteLibComponent = createRemoteComponent('remote-lib/HelloWorld', {
  shadow: true,
  host: 'http://localhost:4001',
});
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="I am host app!" />
      <div>
        <!-- createRemoteApp 会把 attrs 透传给子应用 mount；远端 HelloWorld 有必填 props，需一并传 -->
        <RemoteApp msg="I am remote app" :age="20" name="remote-host" sex="male" tst="physics" />
      </div>
      <div>
        <!-- 远程组件（路线 A）：msg 的类型来自远程 d.ts，写错类型会报错 -->
        <RemoteHelloWorld msg="typed remote component via createRemoteComponent" :age="18" name="from-host" sex="male" tst="math" />
      </div>
      <RemoteLibComponent msg="I am remote lib" />
    </div>
  </header>
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}
.wrapper {
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
  align-items: center;
  width: 100vw;
}
</style>
