<script setup lang="ts">
// 演示 remote → remote 的**构建期静态 import**：
// unplugin-linkjs 把 `remote-lib` 解析为虚拟模块（内部 createRemoteComponent），
// 且 remote-lib 已在 consumeTypes.remotes 声明 preload（构建期预加载）。
import { HelloWorld as RemoteLibHelloWorld } from 'remote-lib';
</script>

<template>
  <div class="lib-static">
    <p class="hint">以下组件是 remoteApp 在<strong>构建期静态 import</strong> 自 <code>remote-lib</code>：</p>
    <RemoteLibHelloWorld />
  </div>
</template>

<style scoped>
.lib-static {
  border: 1px dashed #647eff;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin-top: 0.75rem;
}
.hint {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  color: #4756a8;
}
.hint code {
  background: #eef2ff;
  padding: 0 4px;
  border-radius: 4px;
}
</style>
