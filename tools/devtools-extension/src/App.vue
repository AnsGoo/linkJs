<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from './components/Icon.vue';
import HomeView from './views/HomeView.vue';
import RemoteView from './views/RemoteView.vue';
import { isState, type FetchResult, type Snapshot, type Source } from './common/types';

const props = defineProps<{ source: Source }>();

const tab = ref<'home' | 'remote'>('home');
const filter = ref('');
const result = ref<FetchResult | null>(null);

const ok = computed(() => !!result.value && !isState(result.value));
const snapshot = computed<Snapshot>(() => (ok.value ? (result.value as Snapshot) : {}));
const instanceId = computed(() => (ok.value ? snapshot.value.instance?.id || '' : ''));
const hasError = computed(() => ok.value && (snapshot.value.diagnostics || []).some((d) => d.level === 'error'));

const stateMessage = computed(() => {
  const s = result.value;
  if (!s || isState(s)) {
    if (s && isState(s) && s.__state === 'unreachable') {
      return `无法访问当前页面：${s.message || ''}\n请在 chrome://extensions 将“网站访问权限”设为“在所有网站上”。`;
    }
    if (s && isState(s) && s.__state === 'error') {
      return `读取失败：${s.message || ''}`;
    }
    return '此页面未检测到 linkjs（需在开发模式下 createInstance，暴露 window.__LINKJS__）';
  }
  return '';
});

async function refresh() {
  try {
    result.value = await props.source.fetchSnapshot();
  } catch (error) {
    result.value = { __state: 'unreachable', message: (error as Error)?.message || String(error) };
  }
  if (!result.value) {
    result.value = { __state: 'missing' };
  }
}

function copy() {
  if (ok.value) {
    try {
      navigator.clipboard.writeText(JSON.stringify(snapshot.value, null, 2));
    } catch {
      /* ignore */
    }
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="linkjs-app">
    <div class="rail">
      <button class="tab-btn" :class="{ active: tab === 'home' }" title="Home" @click="tab = 'home'"><Icon name="home" /></button>
      <button class="tab-btn" :class="{ active: tab === 'remote' }" title="Remote" @click="tab = 'remote'"><Icon name="remote" /></button>
    </div>

    <div class="main">
      <div class="topbar" :class="{ 'has-error': hasError }">
        <span class="title">
          <span class="brand">LinkJS</span>
          <span class="id">{{ instanceId }}</span>
        </span>
        <input v-if="ok" v-model="filter" class="filter" name="linkjs-filter" aria-label="过滤 LinkJS 面板内容" placeholder="过滤…" />
        <button v-if="ok" class="mini" title="复制当前快照 JSON" @click="copy">复制 JSON</button>
        <span class="dot" title="存在 error 诊断" />
      </div>

      <div class="content">
        <div v-if="!ok" class="muted">{{ stateMessage }}</div>
        <HomeView v-else-if="tab === 'home'" :snapshot="snapshot" :filter="filter" :on-action="source.onAction" />
        <RemoteView v-else :snapshot="snapshot" :filter="filter" :on-action="source.onAction" />
      </div>
    </div>
  </div>
</template>
