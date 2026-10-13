<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { getRemote, loadApp, unloadRemote } from 'linkjs';

const { snapshot, refresh } = useSnapshot(500);
const busy = ref(false);
const error = ref('');
const libComponent = ref<unknown>(null);
const log = ref<Array<{ t: string; msg: string }>>([]);

const remotes = computed(() => snapshot.value.remotes || []);
const remoteApp = computed(() => remotes.value.find((r) => r.name === 'remoteApp'));
const remoteLib = computed(() => remotes.value.find((r) => r.name === 'remote-lib'));

function stamp(msg: string) {
  const d = new Date();
  const t = `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  log.value.unshift({ t, msg });
}

async function load() {
  busy.value = true;
  error.value = '';
  libComponent.value = null;
  log.value = [];
  stamp('loadApp("remoteApp")');
  try {
    await loadApp('remoteApp');
    stamp('remoteApp 已就绪（其依赖 remote-lib 已被拓扑加载）');
    libComponent.value = getRemote('remoteApp/RemoteLibSlot');
    stamp('getRemote("remoteApp/RemoteLibSlot")');
    refresh();
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
    stamp(`失败：${error.value}`);
  } finally {
    busy.value = false;
  }
}

function unload() {
  unloadRemote('remoteApp');
  libComponent.value = null;
  log.value = [];
  stamp('unloadRemote("remoteApp") — 引用计数归零，remote-lib 一并卸载');
  refresh();
}

const code = `import { loadApp, getRemote, unloadRemote } from 'linkjs';

await loadApp('remoteApp');                       // 拓扑：先 remote-lib，后 remoteApp
const Slot = getRemote('remoteApp/RemoteLibSlot'); // 消费依赖方组件`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>运行时加载</h1>
      <p class="sub">
        宿主仅调用 <code>loadApp('remoteApp')</code>。remoteApp 在注册表声明了依赖
        <code>remote-lib</code>，因此 linkjs 会先加载 remote-lib，再加载 remoteApp，最后用
        <code>getRemote</code> 取用其暴露的组件。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="RuntimeView.vue" :code="code" />

        <div class="controls">
          <button class="btn btn-primary" :disabled="busy" @click="load">
            <span v-if="busy">加载中…</span>
            <span v-else>加载 remoteApp</span>
          </button>
          <button class="btn btn-ghost" :disabled="busy" @click="unload">卸载</button>
        </div>

        <p v-if="error" class="error mono">{{ error }}</p>

        <ul class="log" v-if="log.length">
          <li v-for="(l, i) in log" :key="i">
            <span class="t mono">{{ l.t }}</span>
            <span class="m">{{ l.msg }}</span>
          </li>
        </ul>
      </div>

      <div class="col">
        <div class="panel status-card">
          <div class="row">
            <span class="k mono">remoteApp</span>
            <StatusPill :status="remoteApp?.status" />
          </div>
          <div class="deps" v-if="remoteApp?.deps?.length">
            <span class="faint">依赖</span>
            <span v-for="d in remoteApp.deps" :key="d.name" class="dep-chip mono">
              {{ d.name }} · {{ d.status || '?' }}
            </span>
          </div>
          <div class="row">
            <span class="k mono">remote-lib</span>
            <StatusPill :status="remoteLib?.status" />
          </div>
        </div>

        <div class="panel stage">
          <span class="stage-label mono faint">remoteApp / RemoteLibSlot</span>
          <component :is="libComponent" v-if="libComponent" />
          <p v-else class="faint placeholder">点击「加载 remoteApp」后，此处渲染 remoteApp 消费的 remote-lib 组件。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.head {
  max-width: 720px;
}
.head code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.85em;
  color: var(--accent);
}
.sub {
  margin-top: 14px;
  color: var(--muted);
  line-height: 1.7;
}
.grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 24px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.controls {
  display: flex;
  gap: 10px;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--danger) 8%, transparent);
}
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.log li {
  display: flex;
  gap: 14px;
  padding: 9px 2px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.log .t {
  color: var(--faint);
  font-size: 11.5px;
  padding-top: 2px;
}
.status-card {
  padding: 6px 16px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.row:last-child {
  border-bottom: none;
}
.k {
  font-size: 13px;
}
.deps {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  font-size: 12px;
}
.dep-chip {
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 2px 9px;
  color: var(--muted);
  font-size: 11.5px;
}
.stage {
  padding: 16px;
  min-height: 120px;
}
.stage-label {
  display: block;
  font-size: 11px;
  margin-bottom: 12px;
}
.placeholder {
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
