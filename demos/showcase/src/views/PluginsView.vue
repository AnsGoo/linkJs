<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { loadApp, registerPlugin, type RuntimePlugin } from 'linkjs';

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
const catalog = computed(() => snapshot.value.availablePlugins || []);

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
    await loadApp('remoteApp', { shadow: true });
  } finally {
    busy.value = false;
    read();
  }
}

const registered = ref(false);
function registerTagger() {
  const plugin: RuntimePlugin = {
    name: 'runtime-tagger',
    beforeLoadRemote: (info) => {
      const g = globalThis as { __linkjsHooks?: HookRecord[] };
      g.__linkjsHooks?.unshift({ t: Date.now(), hook: 'beforeLoadRemote', detail: `[tagger] ${info.name}` });
    },
  };
  registerPlugin(plugin);
  registered.value = true;
  read();
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

const code = `// 运行时注册一个插件（等价于 createInstance({ plugin }))
registerPlugin({
  name: 'runtime-tagger',
  beforeLoadRemote: (info) => tag(info),
  afterLoadRemote: (info) => track(info),
});`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>插件机制</h1>
      <p class="sub">
        <code>RuntimePlugin</code> 通过钩子介入远程加载的每个阶段（改写 remoteInfo、埋点、鉴权、降级…）。 本页注册了一个
        <code>demo-inspector</code> 插件记录全部钩子；还可运行时再注册一个。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">已注册插件</h3>
          <div class="chips">
            <span v-for="p in plugins" :key="p" class="pill is-loaded"><span class="dot" />{{ p }}</span>
            <span v-if="!plugins.length" class="faint">（无）</span>
          </div>
        </section>

        <section class="panel block">
          <h3 class="sec">内置插件目录</h3>
          <ul class="catalog">
            <li v-for="c in catalog" :key="c.name">
              <span class="mono c-name">{{ c.name }}</span>
              <span class="c-desc faint">{{ c.description }}</span>
              <span class="pill" :class="c.enabled ? 'is-loaded' : ''">{{ c.enabled ? 'on' : 'off' }}</span>
            </li>
            <li v-if="!catalog.length" class="faint empty">（无）</li>
          </ul>
        </section>

        <section class="panel block">
          <h3 class="sec">钩子阶段</h3>
          <ol class="hooks">
            <li v-for="h in HOOKS" :key="h" class="mono">{{ h }}</li>
          </ol>
        </section>
      </div>

      <div class="col">
        <CodeBlock title="运行时注册" :code="code" />

        <div class="controls">
          <button class="btn btn-primary" :disabled="busy" @click="trigger">加载 remoteApp 触发钩子</button>
          <button class="btn" :disabled="registered" @click="registerTagger">
            {{ registered ? '已注册 runtime-tagger' : '运行时注册插件' }}
          </button>
        </div>
        <p class="hint mono faint">{{ hooks.length }} 条记录</p>

        <ul class="feed">
          <li v-for="(h, i) in hooks.slice(0, 20)" :key="i">
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
  max-width: 780px;
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
  grid-template-columns: 0.85fr 1.15fr;
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
.sec {
  font-size: 0.76rem;
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
.catalog {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.catalog li {
  display: grid;
  grid-template-columns: 130px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
.catalog li:last-child {
  border-bottom: none;
}
.c-name {
  color: var(--text);
}
.c-desc {
  font-size: 12px;
}
.hooks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
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
  gap: 12px;
  flex-wrap: wrap;
}
.hint {
  font-size: 12px;
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: 74px 150px 1fr;
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
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
