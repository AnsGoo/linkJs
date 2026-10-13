<script setup lang="ts">
import { computed, ref } from 'vue';
import { getRemote, getSnapshot, loadApp, unloadRemote } from 'linkjs';

interface DepRow {
  name: string;
  version?: string;
  required?: boolean;
  status?: string;
  resolved?: string;
}
interface RemoteRow {
  name: string;
  displayName?: string;
  type?: string;
  status?: string;
  deps?: DepRow[];
}

const loading = ref(false);
const error = ref('');
const slot = ref<unknown>(null);
const snapshot = ref<{ remotes?: RemoteRow[] } | null>(null);

// 只加载 remoteApp；remote-lib 由 remoteApp 声明的依赖触发加载。
async function load() {
  loading.value = true;
  error.value = '';
  try {
    await loadApp('remoteApp');
    slot.value = getRemote('remoteApp/RemoteLibSlot');
    refresh();
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function unload() {
  unloadRemote('remoteApp');
  slot.value = null;
  refresh();
}

function refresh() {
  snapshot.value = getSnapshot() as { remotes?: RemoteRow[] };
}

refresh();

const remotes = computed(() => snapshot.value?.remotes ?? []);
</script>

<template>
  <main class="wrap">
    <h1>LinkJS · 远程间依赖 Demo</h1>
    <p class="desc">
      宿主只调用 <code>loadApp('remoteApp')</code>；<strong>remote-lib 并不由宿主加载</strong>，
      而是因为 <code>remoteApp</code> 声明了依赖它，被自动<strong>拓扑加载</strong>（先 remote-lib，后 remoteApp）。
    </p>

    <div class="actions">
      <button :disabled="loading" @click="load">{{ loading ? '加载中…' : '加载 remoteApp' }}</button>
      <button class="ghost" :disabled="loading" @click="unload">卸载</button>
    </div>

    <p v-if="error" class="error">加载失败：{{ error }}（请确认 remote-lib:4001 与 remoteApp:8081 已启动）</p>

    <h2>运行时快照（remotes[].deps）</h2>
    <table class="snap">
      <thead>
        <tr><th>远程</th><th>类型</th><th>状态</th><th>依赖的远程</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in remotes" :key="r.name">
          <td>{{ r.displayName || r.name }}</td>
          <td>{{ r.type || '-' }}</td>
          <td>
            <span class="pill" :class="{ loaded: r.status === 'loaded' }">{{ r.status || '-' }}</span>
          </td>
          <td>
            <span v-if="!r.deps || !r.deps.length" class="muted">—</span>
            <span v-for="d in r.deps" :key="d.name" class="dep">
              {{ d.name }}
              <em>{{ d.version ? `(${d.version})` : '' }} · {{ d.status || '?' }}</em>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <h2>remoteApp 消费 remote-lib</h2>
    <div class="stage">
      <component :is="slot" v-if="slot" />
      <span v-else class="muted">点击「加载 remoteApp」后显示。</span>
    </div>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 820px;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1f2937;
}
h1 {
  margin: 0 0 0.5rem;
}
.desc {
  color: #4b5563;
  line-height: 1.6;
}
code {
  background: #eef2ff;
  padding: 0 4px;
  border-radius: 4px;
}
.actions {
  margin: 1rem 0;
  display: flex;
  gap: 0.5rem;
}
button {
  background: #41b883;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
}
button.ghost {
  background: #e5e7eb;
  color: #374151;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.snap {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.snap th,
.snap td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
}
.pill {
  padding: 0 6px;
  border-radius: 8px;
  font-size: 0.72rem;
  background: #e5e7eb;
}
.pill.loaded {
  background: #dcfce7;
  color: #166534;
}
.dep em {
  color: #6b7280;
  font-style: normal;
  font-size: 0.75rem;
}
.muted {
  color: #9ca3af;
}
.stage {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 1rem;
  min-height: 3rem;
}
</style>
