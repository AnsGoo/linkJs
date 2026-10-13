<script setup lang="ts">
import { computed, ref } from 'vue';
import DepGraph from '../components/DepGraph.vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { loadApp, unloadRemote } from 'linkjs';

const { snapshot, refresh } = useSnapshot(500);
const busy = ref(false);
const dead = ref(false);
const showRemoteDeps = ref(true);
const showShared = ref(true);

const rawRemotes = computed(() => snapshot.value.remotes || []);
const shares = computed(() => snapshot.value.shares || []);

// 按开关裁剪边（供 DepGraph 渲染）。
const remotes = computed(() =>
  rawRemotes.value.map((r) => ({
    ...r,
    deps: showRemoteDeps.value ? r.deps : [],
    shared: showShared.value ? r.shared : {},
  })),
);

const providers = computed(() =>
  shares.value.map((s) => ({
    name: s.name,
    scope: s.scope,
    versions: s.versions.map((v) => v.version).join(', '),
    providers: [...new Set(s.versions.map((v) => v.provider || 'host'))].join(', '),
  })),
);

async function load() {
  if (dead.value) return;
  busy.value = true;
  try {
    await loadApp('remoteApp');
  } finally {
    busy.value = false;
    refresh();
  }
}
function reset() {
  unloadRemote('remoteApp');
  dead.value = true;
  refresh();
}
const reload = () => location.reload();
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <div>
        <h1>依赖拓扑</h1>
        <p class="sub">
          实时渲染 <code>HOST → 远程 → 共享依赖 / 远程依赖</code>。加载 remoteApp 时，
          remote-lib 会作为它的远程依赖被先行加载。
        </p>
      </div>
      <div class="controls">
        <button class="btn btn-primary" :disabled="busy || dead" @click="load">加载 remoteApp</button>
        <button class="btn btn-ghost" :disabled="busy" @click="reset">重置</button>
        <button v-if="dead" class="btn" @click="reload">刷新页面</button>
      </div>
    </header>

    <div class="filters">
      <label class="toggle"><input v-model="showRemoteDeps" type="checkbox" /> 远程依赖边</label>
      <label class="toggle"><input v-model="showShared" type="checkbox" /> 共享依赖边</label>
    </div>

    <p v-if="dead" class="notice">已卸载：远端模块已被浏览器缓存，重复加载不会再次 expose —— 点「刷新页面」回到初始态。</p>

    <DepGraph :instance-name="snapshot.instance?.name" :remotes="remotes" :shares="shares" />

    <div class="tables">
      <section>
        <h3 class="sec">远程与依赖</h3>
        <div class="table">
          <div class="thead"><span>远程</span><span>类型</span><span>状态</span><span>依赖的远程</span></div>
          <div v-for="r in rawRemotes" :key="r.name" class="trow">
            <span class="mono">{{ r.displayName || r.name }}</span>
            <span><span class="pill" :class="r.type === 'lib' ? 'k-lib' : 'k-app'">{{ r.type || '-' }}</span></span>
            <span><StatusPill :status="r.status" /></span>
            <span class="mono dep" v-if="r.deps && r.deps.length">
              {{ r.deps.map((d) => `${d.name} (${d.status || '?'})`).join(' · ') }}
            </span>
            <span v-else class="faint">—</span>
          </div>
        </div>
      </section>

      <section>
        <h3 class="sec">共享依赖提供方</h3>
        <div class="table">
          <div class="thead"><span>名称</span><span>作用域</span><span>版本</span><span>提供方</span></div>
          <div v-for="p in providers" :key="`${p.scope}:${p.name}`" class="trow">
            <span class="mono">{{ p.name }}</span>
            <span class="mono faint">{{ p.scope }}</span>
            <span class="mono tnum">{{ p.versions }}</span>
            <span class="mono">{{ p.providers }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.head code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.85em;
  color: var(--accent);
}
.sub {
  margin-top: 12px;
  color: var(--muted);
  max-width: 64ch;
  line-height: 1.7;
}
.controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.notice {
  color: var(--amber);
  font-size: 12.5px;
  line-height: 1.6;
}
.filters {
  display: flex;
  gap: 20px;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}
.toggle input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
}
.tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 10px;
}
.table {
  border-top: 1px solid var(--line);
}
.thead,
.trow {
  display: grid;
  grid-template-columns: 1.3fr 70px 100px 1.5fr;
  gap: 12px;
  align-items: center;
  padding: 11px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
.thead {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
}
.dep {
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 980px) {
  .tables {
    grid-template-columns: 1fr;
  }
}
</style>
