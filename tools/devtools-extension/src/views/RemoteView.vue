<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RemoteSnapshot, Snapshot } from '../common/types';
import TopologyGraph from '../components/TopologyGraph.vue';

const props = defineProps<{
  snapshot: Snapshot;
  filter: string;
  onAction: (op: string, arg?: unknown) => void;
}>();

const q = computed(() => (props.filter || '').trim().toLowerCase());
const match = (text: unknown) => !q.value || String(text).toLowerCase().includes(q.value);

const remotes = computed(() =>
  (props.snapshot.remotes || []).filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`)),
);

const selectedName = ref<string | null>(null);
const selected = computed<RemoteSnapshot | null>(() => (props.snapshot.remotes || []).find((r) => r.name === selectedName.value) || null);

watch(remotes, () => {
  if (selectedName.value && !selected.value) selectedName.value = null;
});

const entryRows = computed(() => {
  const entry = selected.value?.entry;
  if (entry == null) return [];
  if (typeof entry === 'string') return [{ key: 'entry', value: entry }];
  return Object.keys(entry).map((key) => ({ key: `entry.${key}`, value: String((entry as Record<string, unknown>)[key]) }));
});

const metaRows = computed(() => {
  const r = selected.value;
  if (!r) return [];
  const rows: Array<{ key: string; value: string }> = [];
  const push = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') rows.push({ key, value: String(value) });
  };
  push('name', r.name);
  push('displayName', r.displayName);
  push('type', r.type);
  push('status', r.status);
  push('host', r.host);
  push('version', r.version);
  push('shareScope', r.shareScope && r.shareScope.length ? r.shareScope.join(', ') : undefined);
  return rows;
});

const integrityKeys = computed(() => Object.keys(selected.value?.integrity || {}));

interface ShareRow {
  name: string;
  summary: string;
  sub: string[];
}
const sharedRows = computed<ShareRow[]>(() => {
  const shared = selected.value?.shared;
  if (!shared) return [];
  return Object.entries(shared).map(([name, raw]) => {
    const cfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (cfg.version) parts.push(`v${cfg.version}`);
    if (cfg.requiredVersion) parts.push(`req ${cfg.requiredVersion}`);
    if (cfg.scope) parts.push(`scope ${cfg.scope}`);
    if (cfg.singleton) parts.push('singleton');
    if (cfg.eager) parts.push('eager');
    if (cfg.strictVersion) parts.push('strict');
    const deps = Array.isArray(cfg.dependencies) ? cfg.dependencies.map((d) => String(d)) : [];
    return { name, summary: parts.join(' · ') || '—', sub: deps };
  });
});

const topoEdges = computed<Array<[string, string]>>(() => {
  const r = selected.value;
  if (!r) return [];
  const edges: Array<[string, string]> = [];
  for (const row of sharedRows.value) {
    edges.push([r.name, row.name]);
    for (const sub of row.sub) edges.push([row.name, sub]);
  }
  return edges;
});
</script>

<template>
  <div class="remote-split">
    <!-- 左栏：远程列表（App / Lib） -->
    <aside class="remote-list">
      <h3>远程 ({{ remotes.length }})</h3>
      <div v-if="!remotes.length" class="muted">（无）</div>
      <button
        v-for="r in remotes"
        :key="r.name"
        class="remote-item"
        :class="{ active: selectedName === r.name }"
        @click="selectedName = r.name"
      >
        <span class="pill" :class="r.type === 'lib' ? 'lib' : 'app'">{{ r.type === 'lib' ? 'Lib' : 'App' }}</span>
        <span class="rk">{{ r.displayName || r.name }}</span>
        <span class="pill" :class="{ loaded: r.status === 'loaded' }">{{ r.status || '-' }}</span>
      </button>
    </aside>

    <!-- 右栏：上=元数据，下=共享依赖 + 拓扑图 -->
    <section class="remote-detail">
      <div v-if="!selected" class="muted">从左侧选择一个远程查看详情</div>
      <template v-else>
        <h3>元数据</h3>
        <div v-for="row in metaRows" :key="row.key" class="row">
          <span class="k">{{ row.key }}</span>
          <span class="v">{{ row.value }}</span>
        </div>

        <template v-if="entryRows.length">
          <h3>入口</h3>
          <div v-for="row in entryRows" :key="row.key" class="row">
            <span class="k">{{ row.key }}</span>
            <span class="v">{{ row.value }}</span>
          </div>
        </template>

        <template v-if="integrityKeys.length">
          <h3>SRI ({{ integrityKeys.length }})</h3>
          <div v-for="key in integrityKeys" :key="key" class="row">
            <span class="k" :title="key">{{ key }}</span>
            <span class="v">{{ selected.integrity?.[key] }}</span>
          </div>
        </template>

        <h3>操作</h3>
        <div class="row">
          <span class="k">preload / unload</span>
          <span class="actions">
            <button class="mini" @click="onAction('preload', { name: selected.name })">预取</button>
            <button class="mini" @click="onAction(selected.type === 'lib' ? 'unloadLib' : 'unload', selected.name)">卸载</button>
          </span>
        </div>

        <h3>共享依赖 ({{ sharedRows.length }})</h3>
        <div v-if="!sharedRows.length" class="muted">（该远程未声明共享依赖）</div>
        <div v-for="row in sharedRows" :key="row.name" class="row">
          <span class="k">{{ row.name }}</span>
          <span class="v">{{ row.summary }}</span>
        </div>

        <template v-if="sharedRows.length">
          <h3>依赖拓扑</h3>
          <TopologyGraph :root="selected.name" :edges="topoEdges" />
        </template>
      </template>
    </section>
  </div>
</template>
