<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { createRemoteApp } from 'linkjs/vue';
// 路线 A：直接按远程名 import（`remoteImports`，需在 vite.config 配置 consumeTypes.remotes）。
// unplugin-linkjs 把裸说明符解析为虚拟模块，导出 `createRemoteComponent` 包装的组件，
// 内部自动加载 + 影子树隔离 + HMR 重解析；props 类型来自 consumeTypes 生成的远程 d.ts，
// 删/改必填 prop 或传错类型，编辑器会立即报错。
import { HelloWorld as RemoteHelloWorld } from 'remoteApp';
import { HelloWorld as RemoteLibHelloWorld } from 'remote-lib';

// host 由 unplugin-linkjs 依据 consumeTypes.remotes 构建期注入（__linkjs_remote_hosts__），
// 故无需在此重复传 host。
const RemoteApp = createRemoteApp('remoteApp', { shadow: true });
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
        <!-- 远程组件（路线 A）：`import { HelloWorld } from 'remoteApp'` 直接消费 -->
        <RemoteHelloWorld msg="imported from 'remoteApp'" :age="18" name="from-host" sex="male" tst="math" />
      </div>
      <div>
        <!-- 远程库同样支持：`import { HelloWorld } from 'remote-lib'` -->
        <RemoteLibHelloWorld msg="imported from 'remote-lib'" />
      </div>
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
