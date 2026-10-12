<script setup lang="ts">
// 路线 A（构建期）：只有声明了 consumeTypes.remotes[].preload 的 remote 才支持静态 import。
// unplugin-linkjs 把裸说明符解析成虚拟模块，导出 createRemoteComponent 包装的组件，
// 内部自动加载 + 影子树隔离 + HMR 重解析；props 类型来自 consumeTypes 生成远程 d.ts。
import { HelloWorld as RemoteHelloWorld } from 'remoteApp';
import { HelloWorld as RemoteLibHelloWorld } from 'remote-lib';
</script>

<template>
  <section class="example">
    <h2>路线 A · 构建期 import</h2>
    <p class="desc">
      直接 <code>import { HelloWorld } from 'remoteApp'</code>。仅对开启 <code>preload</code> 的
      remote 生效；未开启（lazy）的 remote 只能用运行时的 <code>loadRemote</code>（见「运行时加载」页）。
    </p>
    <pre class="code">import { HelloWorld as RemoteHelloWorld } from 'remoteApp';
import { HelloWorld as RemoteLibHelloWorld } from 'remote-lib';</pre>
    <div class="stage">
      <RemoteHelloWorld msg="imported from 'remoteApp'" :age="18" name="from-host" sex="male" tst="math" />
    </div>
    <div class="stage">
      <RemoteLibHelloWorld msg="imported from 'remote-lib'" />
    </div>
  </section>
</template>

<style scoped>
.example h2 {
  margin-top: 0;
}
.desc {
  color: #4b5563;
}
.code {
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.8rem;
  overflow: auto;
}
.stage {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}
</style>
