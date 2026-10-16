<script setup lang="ts">
import { computed, ref } from 'vue';
import { getInstance, getShare, loadShare } from 'linkjs';

interface KitModule {
  version?: string;
  tag?: string;
  describe?: () => string;
}

interface LogRow {
  at: string;
  strategy: string;
  req: string;
  resolved: string;
}

const strategy = ref(getInstance().shareStrategy);
const requirement = ref('');
const log = ref<LogRow[]>([]);
const tick = ref(0);

const current = computed<KitModule | null>(() => {
  void tick.value;
  return (getShare('linkkit') as KitModule | null) || null;
});

function label(mod: KitModule | null | undefined): string {
  if (!mod) return 'null';
  return `${mod.version ?? '?'} · ${mod.tag ?? '?'}`;
}

async function resolve(): Promise<void> {
  const instance = getInstance();
  strategy.value = instance.shareStrategy;
  const mod = (await loadShare('linkkit', requirement.value ? { version: requirement.value } : undefined)) as KitModule | null;
  log.value.unshift({
    at: new Date().toLocaleTimeString(),
    strategy: instance.shareStrategy,
    req: requirement.value || '(latest)',
    resolved: label(mod),
  });
  tick.value++;
}
</script>

<template>
  <div class="probe">
    <header class="head">
      <span class="dot" />
      <strong>NegotiationProbe</strong>
      <span class="tag">来自 share-remote 远端</span>
    </header>

    <p class="cur">
      远端视角 <code>getShare('linkkit')</code> →
      <b class="mono">{{ label(current) }}</b>
    </p>

    <div class="row">
      <select v-model="requirement">
        <option value="">latest（不指定）</option>
        <option value="1.0.0">= 1.0.0</option>
        <option value="2.0.0">= 2.0.0</option>
        <option value="^1.0.0">^1.0.0</option>
        <option value="^2.0.0">^2.0.0</option>
        <option value="^9.0.0">^9.0.0（不满足）</option>
      </select>
      <button type="button" @click="resolve">在远端调用 loadShare</button>
    </div>

    <ul class="log">
      <li v-for="(row, i) in log.slice(0, 4)" :key="i">
        <span class="t mono">{{ row.at }}</span>
        <span class="s mono">{{ row.strategy }}</span>
        <span class="r mono">req {{ row.req }}</span>
        <span class="res mono">→ {{ row.resolved }}</span>
      </li>
      <li v-if="!log.length" class="empty">点击按钮，观察远端拿到的版本随宿主策略变化。</li>
    </ul>
  </div>
</template>

<style scoped>
.probe {
  border: 1px solid #2a3040;
  border-radius: 12px;
  padding: 16px;
  background: #11151f;
  color: #e6e9ef;
  font-size: 13px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7c9cff;
  box-shadow: 0 0 0 4px rgba(124, 156, 255, 0.16);
}
.tag {
  color: #8b93a7;
  font-size: 12px;
}
.cur {
  margin: 0 0 12px;
  color: #aeb6c6;
}
.cur code {
  background: rgba(255, 255, 255, 0.07);
  padding: 1px 6px;
  border-radius: 5px;
  color: #7c9cff;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cur b {
  color: #e6e9ef;
}
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
select {
  flex: 0 0 auto;
  background: #0c0f16;
  color: #e6e9ef;
  border: 1px solid #2a3040;
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
}
button {
  background: #7c9cff;
  color: #0b0e14;
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:hover {
  background: #93acff;
}
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid #222838;
}
.log li {
  display: grid;
  grid-template-columns: 74px 100px 96px 1fr;
  gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px solid #222838;
  align-items: baseline;
}
.t {
  color: #6b7386;
}
.s {
  color: #7c9cff;
}
.r {
  color: #aeb6c6;
}
.res {
  color: #e6e9ef;
}
.empty {
  display: block;
  color: #6b7386;
}
</style>
