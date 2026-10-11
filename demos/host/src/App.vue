<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { defineAsyncComponent } from 'vue';
import { getRemote, loadLib } from 'linkjs';
import { createRemoteApp, LinkjsShadowRoot } from 'linkjs/vue';

const RemoteApp = createRemoteApp('remoteApp', { shadow: true, host: 'http://localhost:8080' });
const RemoteLibComponent = defineAsyncComponent(async () => {
  const remoteLib = await loadLib('remote-lib/HelloWorld', {
    host: 'http://localhost:4001',
    shadow: true,
  });
  return remoteLib!;
});

// A1 类型转发示例：`consumeTypes` 生成类型后，`getRemote` 按 entry 推导远程组件类型。
// 远程 HelloWorld 的 props 为 `{ msg: string }`，写错类型（如 `:msg="23"`）编辑器会报错。
const RemoteHelloWorld = getRemote('remoteApp/HelloWorld')!;
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="I am host app!" />
      <div>
        <RemoteApp msg="I am remote app" />
      </div>
      <div>
        <!-- 远程组件（路线 A）：msg 的类型来自远程 d.ts，写错类型会报错 -->
        <RemoteHelloWorld
          msg="typed remote component via getRemote"
          :age="18"
          name="from-host"
          sex="male"
          tst="math"
        />
      </div>
      <LinkjsShadowRoot name="remote-lib">
        <RemoteLibComponent msg="I am remote lib" />
      </LinkjsShadowRoot>
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
