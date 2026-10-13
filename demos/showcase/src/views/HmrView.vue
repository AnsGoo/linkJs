<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { loadApp, subscribeRemoteUpdate } from 'linkjs';

interface UpdateRec {
  t: number;
  app: string;
  payload: unknown;
}

const { snapshot, refresh } = useSnapshot(700);
const updates = ref<UpdateRec[]>([]);
const busy = ref(false);
let off: (() => void) | undefined;

const remoteApp = computed(() => (snapshot.value.remotes || []).find((r) => r.name === 'remoteApp'));
const events = computed(() => (snapshot.value.events || []).filter((e) => e.type === 'remoteUpdate' || e.type === 'libExpose'));

const steps = [
  { k: '编辑远端组件', v: '改动 demo/remote 源码' },
  { k: 'dev server 重新 expose', v: '模块热替换' },
  { k: 'linkjs 广播 REMOTE_UPDATE', v: '事件总线' },
  { k: '宿主 subscribeRemoteUpdate', v: '无刷新更新' },
];

onMounted(() => {
  off = subscribeRemoteUpdate('remoteApp', (payload) => {
    updates.value.unshift({ t: Date.now(), app: 'remoteApp', payload });
    refresh();
  });
});
onUnmounted(() => off?.());

async function load() {
  busy.value = true;
  try {
    await loadApp('remoteApp');
    refresh();
  } finally {
    busy.value = false;
  }
}

function timeStr(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const code = `import { subscribeRemoteUpdate } from 'linkjs';

const off = subscribeRemoteUpdate('remoteApp', (payload) => {
  console.log('remote updated', payload);
});`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>HMR 热更新</h1>
      <p class="sub">
        远端 dev server 重新暴露模块时，linkjs 广播 <code>REMOTE_UPDATE</code>；宿主用
        <code>subscribeRemoteUpdate</code> 订阅即可无刷新更新。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="HmrView.vue" :code="code" />

        <div class="steps">
          <div v-for="(s, i) in steps" :key="s.k" class="step">
            <span class="step-i mono">{{ i + 1 }}</span>
            <span class="step-k">{{ s.k }}</span>
            <span class="step-v faint">{{ s.v }}</span>
          </div>
        </div>

        <div class="controls">
          <button class="btn btn-primary" :disabled="busy" @click="load">加载 remoteApp</button>
          <span class="pill" :class="remoteApp?.status === 'loaded' ? 'is-loaded' : ''">
            <span class="dot" />{{ remoteApp?.status || 'idle' }}
          </span>
        </div>
        <p class="howto">
          在远端运行中编辑 <code>demos/remote/src/components/HelloWorld.vue</code> 并保存，
          即可在此看到 <code>REMOTE_UPDATE</code> 记录。
        </p>
      </div>

      <div class="col">
        <h3 class="sec">订阅到的更新（{{ updates.length }}）</h3>
        <ul class="feed">
          <li v-for="(u, i) in updates.slice(0, 8)" :key="i">
            <span class="t mono faint">{{ timeStr(u.t) }}</span>
            <span class="ev mono">REMOTE_UPDATE</span>
            <span class="d mono">{{ u.app }}</span>
          </li>
          <li v-if="!updates.length" class="empty faint">暂无更新；先加载 remoteApp，再编辑远端组件。</li>
        </ul>

        <h3 class="sec">事件总线</h3>
        <ul class="feed">
          <li v-for="(e, i) in events.slice(0, 8)" :key="i">
            <span class="t mono faint">{{ timeStr(e.time) }}</span>
            <span class="ev mono">{{ e.type }}</span>
            <span class="d mono">{{ e.summary }}</span>
          </li>
          <li v-if="!events.length" class="empty faint">加载后可见 libExpose / remoteUpdate 事件。</li>
        </ul>
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
.head code,
.sub code,
.howto code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.85em;
  color: var(--accent);
}
.sub {
  margin-top: 14px;
  color: var(--muted);
  max-width: 66ch;
  line-height: 1.7;
}
.grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--line);
}
.step {
  display: grid;
  grid-template-columns: 24px 170px 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 11px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.step-i {
  color: var(--accent);
  font-size: 11px;
}
.step-k {
  font-weight: 600;
}
.step-v {
  font-size: 12.5px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.howto {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin: 4px 0 0;
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: 80px 140px 1fr;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.ev {
  color: var(--accent);
}
.empty {
  grid-template-columns: 1fr;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
