<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RemoteSnapshot, Snapshot } from '../common/types';

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

// 列表变化时，若选中的 remote 不存在则清空。
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
</script>

<template>
  <div v-if="!selected">
    <h3>已加载远程 ({{ remotes.length }})</h3>
    <div v-if="!remotes.length" class="muted">（无）</div>
    <button
      v-for="r in remotes"
      :key="r.name"
      class="remote-item"
      :class="{ active: selectedName === r.name }"
      @click="selectedName = r.name"
    >
      <span class="rk">{{ r.displayName || r.name }}{{ r.displayName && r.displayName !== r.name ? ` (${r.name})` : '' }}</span>
      <span class="rt">{{ r.type || '-' }} · {{ r.host || '-' }}</span>
      <span class="pill" :class="{ loaded: r.status === 'loaded' }">{{ r.status || '-' }}</span>
    </button>
  </div>

  <div v-else>
    <div class="detail-head">
      <button class="mini" @click="selectedName = null">← 返回</button>
      <strong>{{ selected.displayName || selected.name }}</strong>
    </div>

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
        <button
          class="mini"
          @click="onAction(selected.type === 'lib' ? 'unloadLib' : 'unload', selected.name)"
        >
          卸载
        </button>
      </span>
    </div>
  </div>
</template>
