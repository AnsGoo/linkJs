<script setup lang="ts">
import { computed, ref } from 'vue';
import { getSnapshot, preloadRemote } from 'linkjs';

const snapshot = ref(getSnapshot());
const pretty = computed(() => JSON.stringify(snapshot.value, null, 2));

function refresh() {
  snapshot.value = getSnapshot();
}

async function forcePreload(name: string) {
  // host / manifestUrl 由构建期注入（__linkjs_remote_hosts__）提供，这里只需 name。
  await preloadRemote({ name, force: true }).catch(() => {
    /* 远端未启动时忽略 */
  });
  refresh();
}
</script>

<template>
  <section class="example">
    <h2>可观测 / 预加载</h2>
    <p class="desc">
      <code>getSnapshot()</code> 返回当前实例的 remotes / shares / plugins / 诊断快照；
      <code>preloadRemote</code> 可强制刷新某远端的 manifest 与资源预热。控制台也可用
      <code>__LINKJS__</code>。
    </p>

    <div class="actions">
      <button @click="refresh">刷新快照</button>
      <button @click="forcePreload('remoteApp')">强制预加载 remoteApp</button>
      <button @click="forcePreload('remote-lib')">强制预加载 remote-lib</button>
    </div>

    <pre class="code">{{ pretty }}</pre>
  </section>
</template>

<style scoped>
.example h2 {
  margin-top: 0;
}
.desc {
  color: #4b5563;
}
.actions {
  display: flex;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
button {
  padding: 0.4rem 0.8rem;
  border: 1px solid #41b883;
  background: #fff;
  color: #1f2937;
  border-radius: 6px;
  cursor: pointer;
}
button:hover {
  background: #f0fdf7;
}
.code {
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.78rem;
  max-height: 60vh;
  overflow: auto;
}
</style>
