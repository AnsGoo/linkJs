<script setup lang="ts">
import { computed, ref } from 'vue';
import DepGraph from '../components/DepGraph.vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { loadApp, unloadRemote } from 'linkjs';

const { snapshot, refresh } = useSnapshot(500);
const busy = ref(false);

const remotes = computed(() => snapshot.value.remotes || []);
const shares = computed(() => snapshot.value.shares || []);

async function load() {
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
  refresh();
}
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
        <button class="btn btn-primary" :disabled="busy" @click="load">加载 remoteApp</button>
        <button class="btn btn-ghost" :disabled="busy" @click="reset">重置</button>
      </div>
    </header>

    <DepGraph :instance-name="snapshot.instance?.name" :remotes="remotes" :shares="shares" />

    <div class="panel table">
      <div class="thead">
        <span>远程</span><span>类型</span><span>状态</span><span>依赖的远程</span>
      </div>
      <div v-for="r in remotes" :key="r.name" class="trow">
        <span class="mono name">{{ r.displayName || r.name }}</span>
        <span><span class="pill" :class="r.type === 'lib' ? 'k-lib' : 'k-app'">{{ r.type || '-' }}</span></span>
        <span><StatusPill :status="r.status" /></span>
        <span class="mono deps">
          <template v-if="r.deps && r.deps.length">
            <span v-for="d in r.deps" :key="d.name" class="dep">{{ d.name }} · {{ d.status || '?' }}</span>
          </template>
          <span v-else class="faint">—</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
  max-width: 62ch;
  line-height: 1.7;
}
.controls {
  display: flex;
  gap: 10px;
}
.table {
  overflow: hidden;
}
.thead,
.trow {
  display: grid;
  grid-template-columns: 1.4fr 90px 120px 1.6fr;
  gap: 16px;
  align-items: center;
  padding: 12px 16px;
}
.thead {
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
}
.trow {
  border-bottom: 1px solid var(--line);
}
.trow:last-child {
  border-bottom: none;
}
.name {
  font-size: 13px;
}
.deps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted);
}
.dep {
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11.5px;
}
</style>
