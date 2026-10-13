<script setup lang="ts">
// 演示 remote → remote：remoteApp 声明依赖 remote-lib，并在运行时消费其 expose。
// 依赖由宿主在加载 remoteApp 前按拓扑自动加载（见 docs/remote-dependencies.md）。
import { getRemote } from 'linkjs';

const RemoteLibHelloWorld = getRemote('remote-lib/HelloWorld');
</script>

<template>
  <div class="lib-slot">
    <p class="hint">以下组件来自 <code>remote-lib</code>（由 remoteApp 声明依赖并消费）：</p>
    <component :is="RemoteLibHelloWorld" v-if="RemoteLibHelloWorld" />
    <em v-else>remote-lib 未加载</em>
  </div>
</template>

<style scoped>
.lib-slot {
  border: 1px dashed #41b883;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin-top: 0.75rem;
}
.hint {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  color: #3f7d5f;
}
.hint code {
  background: #eafaf3;
  padding: 0 4px;
  border-radius: 4px;
}
</style>
