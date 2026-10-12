<script setup lang="ts">
import { ref, shallowRef, type Component } from 'vue';
import { loadLib, loadRemote } from 'linkjs';

// 运行时（懒）加载：点击时再主动加载，拿到组件后用 <component :is> 渲染。
// 适用于未开启 preload（lazy）的 remote，或不希望首屏加载的场景。
const remoteComp = shallowRef<Component | null>(null);
const libComp = shallowRef<Component | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadRemoteApp() {
  loading.value = true;
  error.value = null;
  try {
    remoteComp.value = (await loadRemote('remoteApp/HelloWorld')) as Component;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function loadRemoteLib() {
  loading.value = true;
  error.value = null;
  try {
    libComp.value = (await loadLib('remote-lib/HelloWorld')) as Component;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="example">
    <h2>运行时加载 · loadRemote / loadLib</h2>
    <p class="desc">
      <code>loadRemote(entry)</code> 按注册类型分发（app / lib），返回解析后的组件；
      用 <code>&lt;component :is&gt;</code> 渲染。这里演示点击后再加载。
    </p>
    <pre class="code">const comp = await loadRemote('remoteApp/HelloWorld');
// &lt;component :is="comp" msg="..." :age="18" name="..." sex="male" /&gt;</pre>

    <div class="actions">
      <button :disabled="loading" @click="loadRemoteApp">加载 remoteApp/HelloWorld</button>
      <button :disabled="loading" @click="loadRemoteLib">加载 remote-lib/HelloWorld</button>
      <span v-if="loading" class="muted">加载中…</span>
      <span v-if="error" class="error">{{ error }}</span>
    </div>

    <div class="stage">
      <component :is="remoteComp" v-if="remoteComp" msg="lazy remoteApp" :age="18" name="from-host" sex="male" tst="math" />
      <span v-else class="muted">（尚未加载 remoteApp）</span>
    </div>
    <div class="stage">
      <component :is="libComp" v-if="libComp" msg="lazy remote-lib" />
      <span v-else class="muted">（尚未加载 remote-lib）</span>
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
.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
button {
  padding: 0.4rem 0.8rem;
  border: 1px solid #41b883;
  background: #41b883;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.muted {
  color: #9ca3af;
}
.error {
  color: #dc2626;
}
.stage {
  margin-top: 0.5rem;
  padding: 1rem;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}
</style>
