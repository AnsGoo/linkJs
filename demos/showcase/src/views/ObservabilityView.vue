<script setup lang="ts">
import { computed, ref } from 'vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';

const { snapshot } = useSnapshot(600);

const instance = computed(() => snapshot.value.instance || {});
const remotes = computed(() => snapshot.value.remotes || []);
const shares = computed(() => snapshot.value.shares || []);
const events = computed(() => snapshot.value.events || []);
const diagnostics = computed(() => snapshot.value.diagnostics || []);
const metrics = computed(() => (snapshot.value.metrics || []).slice(0, 8));
const perf = computed(() => (snapshot.value.perf || []).slice(0, 8));
const conflicts = computed(() => snapshot.value.conflicts || []);

const diagFilter = ref<'all' | 'warn' | 'error'>('all');
const filteredDiag = computed(() =>
  diagnostics.value.filter((d) => diagFilter.value === 'all' || d.level === diagFilter.value),
);

function timeStr(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>可观测</h1>
      <p class="sub">运行时快照 <code>getSnapshot()</code> 的实时视图：实例、依赖、共享、事件、指标、性能与诊断。</p>
    </header>

    <section class="block">
      <h2>实例</h2>
      <dl class="defs">
        <div><dt>id</dt><dd class="mono">{{ instance.id }}</dd></div>
        <div><dt>name</dt><dd class="mono">{{ instance.name }}</dd></div>
        <div><dt>version</dt><dd class="mono">{{ instance.version }}</dd></div>
        <div><dt>mode</dt><dd class="mono">{{ instance.mode }}</dd></div>
        <div><dt>shareStrategy</dt><dd class="mono">{{ instance.shareStrategy }}</dd></div>
        <div><dt>origin</dt><dd class="mono">{{ instance.origin }}</dd></div>
      </dl>
    </section>

    <div class="two">
      <section class="block">
        <h2>远程与依赖</h2>
        <div class="table">
          <div class="thead"><span>远程</span><span>类型</span><span>状态</span><span>依赖</span></div>
          <div v-for="r in remotes" :key="r.name" class="trow">
            <span class="mono">{{ r.name }}</span>
            <span class="mono faint">{{ r.type || '-' }}</span>
            <span><StatusPill :status="r.status" /></span>
            <span class="mono dep" v-if="r.deps && r.deps.length">
              {{ r.deps.map((d) => `${d.name} (${d.resolved || d.version || '?'})`).join(' · ') }}
            </span>
            <span v-else class="faint">—</span>
          </div>
        </div>
      </section>

      <section class="block">
        <h2>共享依赖</h2>
        <div class="table">
          <div class="thead"><span>名称</span><span>作用域</span><span>版本</span><span>提供方</span></div>
          <div v-for="s in shares" :key="`${s.scope}:${s.name}`" class="trow">
            <span class="mono">{{ s.name }}</span>
            <span class="mono faint">{{ s.scope }}</span>
            <span class="mono tnum">{{ s.versions.map((v) => v.version).join(', ') }}</span>
            <span class="mono">{{ s.versions.map((v) => v.provider || 'host').join(', ') }}</span>
          </div>
        </div>
      </section>
    </div>

    <section class="block" v-if="conflicts.length">
      <h2>共享版本冲突</h2>
      <div class="table">
        <div class="thead"><span>依赖</span><span>需要</span><span>已提供</span></div>
        <div v-for="(c, i) in conflicts" :key="i" class="trow three">
          <span class="mono">{{ c.name }}</span>
          <span class="mono faint">{{ c.requiredVersion }}</span>
          <span class="mono">{{ c.provided.join(', ') }}</span>
        </div>
      </div>
    </section>

    <div class="two">
      <section class="block">
        <h2>加载指标</h2>
        <ul class="feed" v-if="metrics.length">
          <li v-for="(m, i) in metrics" :key="i">
            <span class="t mono faint">{{ timeStr(m.time) }}</span>
            <span class="tag mono">{{ m.kind }}</span>
            <span class="msg">{{ m.entry }}</span>
            <span class="dur mono tnum">{{ m.durationMs }}ms</span>
          </li>
        </ul>
        <p v-else class="faint empty">启用 logger 插件后可见（本示例未启用）。</p>
      </section>

      <section class="block">
        <h2>性能标记</h2>
        <ul class="feed" v-if="perf.length">
          <li v-for="(p, i) in perf" :key="i">
            <span class="msg mono">{{ p.label || p.name }}</span>
            <span class="dur mono tnum">{{ p.durationMs }}ms</span>
          </li>
        </ul>
        <p v-else class="faint empty">加载后会记录各阶段耗时。</p>
      </section>
    </div>

    <div class="two">
      <section class="block">
        <h2>事件</h2>
        <ul class="feed" v-if="events.length">
          <li v-for="(e, i) in events.slice(0, 12)" :key="i">
            <span class="t mono faint">{{ timeStr(e.time) }}</span>
            <span class="tag mono">{{ e.type }}</span>
            <span class="msg">{{ e.summary }}</span>
          </li>
        </ul>
        <p v-else class="faint empty">暂无事件（触发一次加载后可见）。</p>
      </section>

      <section class="block">
        <div class="diag-head">
          <h2>诊断</h2>
          <div class="seg">
            <button v-for="f in ['all', 'warn', 'error'] as const" :key="f" :class="{ on: diagFilter === f }" @click="diagFilter = f">{{ f }}</button>
          </div>
        </div>
        <ul class="feed" v-if="filteredDiag.length">
          <li v-for="(d, i) in filteredDiag.slice(0, 12)" :key="i">
            <span class="t mono faint">{{ timeStr(d.time) }}</span>
            <span class="tag mono" :class="d.level">{{ d.code }}</span>
            <span class="msg">{{ d.message }}</span>
          </li>
        </ul>
        <p v-else class="faint empty">无匹配诊断。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 30px;
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
  max-width: 66ch;
  line-height: 1.7;
}
.block h2 {
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 10px;
}
.defs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0;
  margin: 0;
  border-top: 1px solid var(--line);
}
.defs > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--line);
}
dt {
  color: var(--faint);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--mono);
}
dd {
  margin: 0;
  font-size: 13.5px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}
.table {
  border-top: 1px solid var(--line);
}
.thead,
.trow {
  display: grid;
  grid-template-columns: 1.2fr 70px 100px 1.6fr;
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
.trow.three {
  grid-template-columns: 1.2fr 1fr 1.4fr;
}
.dep {
  font-size: 12px;
  color: var(--muted);
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: 64px auto 1fr auto;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  align-items: baseline;
}
.tag {
  color: var(--indigo);
  font-size: 11px;
}
.tag.error {
  color: var(--danger);
}
.tag.warn {
  color: var(--amber);
}
.msg {
  color: var(--muted);
}
.dur {
  color: var(--text);
  font-size: 12px;
}
.diag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  overflow: hidden;
}
.seg button {
  background: transparent;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}
.seg button.on {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.empty {
  font-size: 13px;
  padding: 10px 4px;
}
@media (max-width: 900px) {
  .two {
    grid-template-columns: 1fr;
  }
  .thead,
  .trow {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
}
</style>
