<script setup lang="ts">
import { createRemoteComponent } from 'linkjs/vue';

// 路线 A（手动工厂）：一行拿到可用的远程组件，内部负责加载、影子树隔离、HMR 重解析。
// 不需要构建期 import 配置（remoteImports 关闭时也可用）。
const RemoteHelloWorld = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });
const RemoteLibHelloWorld = createRemoteComponent('remote-lib/HelloWorld', { shadow: true });
</script>

<template>
  <section class="example">
    <h2>路线 A · createRemoteComponent</h2>
    <p class="desc">
      无需构建期 import：显式给出 <code>entry</code> 即可拿到组件；<code>shadow: true</code> 渲染进远程影子树。
    </p>
    <pre class="code">const RemoteHelloWorld = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });
// &lt;RemoteHelloWorld msg="..." :age="18" name="..." sex="male" /&gt;</pre>
    <div class="stage">
      <RemoteHelloWorld msg="via createRemoteComponent" :age="18" name="from-host" sex="male" tst="math" />
    </div>
    <div class="stage">
      <RemoteLibHelloWorld msg="remote-lib via createRemoteComponent" />
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
