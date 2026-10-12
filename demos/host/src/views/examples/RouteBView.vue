<script setup lang="ts">
import { createRemoteApp } from 'linkjs/vue';

// 路线 B：子应用用自己的 runtime 挂载。host 由构建期注入，无需显式传。
const RemoteApp = createRemoteApp('remoteApp', { shadow: true });
</script>

<template>
  <section class="example">
    <h2>路线 B · createRemoteApp</h2>
    <p class="desc">
      宿主只提供一个容器，远端入口 expose <code>{ mount, unmount }</code> 后自行挂载/卸载。
      <code>shadow: true</code> 把子应用连同样式放进影子树（原生 CSS 隔离）。
      attrs 会透传给 <code>mount</code>。
    </p>
    <pre class="code">const RemoteApp = createRemoteApp('remoteApp', { shadow: true });
// &lt;RemoteApp msg="..." :age="20" name="..." sex="male" /&gt;</pre>
    <div class="stage">
      <RemoteApp msg="route B via createRemoteApp" :age="20" name="remote-host" sex="male" tst="physics" />
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
