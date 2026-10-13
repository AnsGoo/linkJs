<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSnapshot } from '../composables/useSnapshot';
import { loadApp } from 'linkjs';

interface HookRecord {
  t: number;
  hook: string;
  detail: string;
}

const { snapshot } = useSnapshot(1500);
const hooks = ref<HookRecord[]>([]);
const busy = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const plugins = computed(() => snapshot.value.plugins || []);

function read() {
  hooks.value = [...((globalThis as { __linkjsHooks?: HookRecord[] }).__linkjsHooks || [])];
}
onMounted(() => {
  read();
  timer = setInterval(read, 400);
});
onUnmounted(() => timer && clearInterval(timer));

async function trigger() {
  busy.value = true;
  try {
    await loadApp('remoteApp');
  } finally {
    busy.value = false;
    read();
  }
}

function timeStr(t: number) {
  const d = new Date(t);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const HOOKS = [
  'beforeLoadRemote',
  'afterResolve',
  'beforeLoadContainer',
  'beforeLoadEntry',
  'afterLoadEntry',
  'onLoad',
  'afterLoadRemote',
  'beforeLoadShare',
  'afterLoadShare',
  'errorLoadRemote',
];
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>插件机制</h1>
      <p class="sub">
        <code>RuntimePlugin</code> 通过钩子介入远程加载的每个阶段（改写 remoteInfo、埋点、鉴权、降级…）。
        本页注册了一个 <code>demo-inspector</code> 插件，把钩子调用实时记录下来。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h2>已注册插件</h2>
          <div class="chips">
            <span v-for="p in plugins" :key="p" class="pill is-loaded"><span class="dot" />{{ p }}</span>
            <span v-if="!plugins.length" class="faint">（无）</span>
          </div>
        </section>

        <section class="panel block">
          <h2>钩子阶段</h2>
          <ol class="hooks">
            <li v-for="h in HOOKS" :key="h" class="mono">{{ h }}</li>
          </ol>
        </section>
      </div>

      <div class="col">
        <div class="controls">
          <button class="btn btn-primary" :disabled="busy" @click="trigger">加载 remoteApp 触发钩子</button>
          <span class="mono faint">{{ hooks.length }} 条记录</span>
        </div>
        <ul class="feed">
          <li v-for="(h, i) in hooks.slice(0, 18)" :key="i">
            <span class="t mono faint">{{ timeStr(h.t) }}</span>
            <span class="hook mono">{{ h.hook }}</span>
            <span class="d mono">{{ h.detail }}</span>
          </li>
          <li v-if="!hooks.length" class="empty faint">点击按钮后，此处显示插件的钩子调用。</li>
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
.head {
  max-width: 760px;
}
.head code,
.sub code {
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
  grid-template-columns: 0.8fr 1.2fr;
  gap: 24px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.block {
  padding: 16px;
}
.block h2,
.feed + * {
  margin-bottom: 10px;
}
.block h2 {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 12px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hooks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hooks li {
  font-size: 12px;
  color: var(--muted);
  padding-left: 14px;
  position: relative;
}
.hooks li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--indigo);
}
.controls {
  display: flex;
  align-items: center;
  gap: 14px;
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: 70px 150px 1fr;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  align-items: baseline;
}
.hook {
  color: var(--accent);
}
.d {
  color: var(--muted);
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
