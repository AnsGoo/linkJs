<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface Expose {
  name: string;
  deps?: { remotes?: Record<string, unknown>; shared?: string[] };
}
interface RemoteManifest {
  name?: string;
  exposes?: Expose[];
}

const REMOTES = [
  { name: 'remoteApp', manifestUrl: 'http://localhost:8081/manifest.json' },
  { name: 'remote-lib', manifestUrl: 'http://localhost:4001/mf/manifest.json' },
];

const data = ref<Array<{ name: string; manifestUrl: string; exposes: Expose[]; error?: string }>>([]);
const loading = ref(true);

onMounted(async () => {
  const results = await Promise.all(
    REMOTES.map(async (r) => {
      try {
        const res = await fetch(r.manifestUrl, { cache: 'no-store' });
        if (!res.ok) {
          return { ...r, exposes: [], error: `HTTP ${res.status}` };
        }
        const manifest = (await res.json()) as RemoteManifest;
        return { ...r, exposes: manifest.exposes ?? [] };
      } catch (e) {
        return { ...r, exposes: [], error: (e as Error)?.message || String(e) };
      }
    }),
  );
  data.value = results;
  loading.value = false;
});
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>Expose 级依赖</h1>
      <p class="sub">
        远端构建期按每个 expose 的模块闭包补全 <code>exposes[].deps</code>；消费某 expose 时只解析其 <code>deps</code>（远程 +
        共享），不再拖入其它 expose 的依赖。
      </p>
    </header>

    <p v-if="loading" class="faint">加载中…</p>

    <section v-for="r in data" :key="r.name" class="block">
      <h3 class="sec">
        {{ r.name }} <span class="faint mono">· {{ r.manifestUrl }}</span>
      </h3>
      <p v-if="r.error" class="error mono">{{ r.error }}</p>
      <div v-else-if="!r.exposes.length" class="faint">（无 exposes）</div>
      <div v-else class="table">
        <div class="thead"><span>expose</span><span>shared</span><span>remotes</span></div>
        <div v-for="e in r.exposes" :key="e.name" class="trow">
          <span class="mono name">{{ e.name }}</span>
          <span class="mono">
            <template v-if="e.deps?.shared?.length">
              <span v-for="s in e.deps.shared" :key="s" class="pill k-lib">{{ s }}</span>
            </template>
            <span v-else class="faint">—</span>
          </span>
          <span class="mono">
            <template v-if="e.deps?.remotes && Object.keys(e.deps.remotes).length">
              <span v-for="(_, n) in e.deps.remotes" :key="n" class="pill k-app">{{ n }}</span>
            </template>
            <span v-else class="faint">—</span>
          </span>
        </div>
      </div>
    </section>

    <p class="note faint">
      对照：remote-lib 的 <code>HelloWorld</code> 仅依赖 <code>vue</code>；<code>PiniaCounter</code> 还依赖 <code>pinia</code> ——
      消费前者不会加载后者的 pinia。
    </p>
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
.note code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.85em;
  color: var(--accent);
}
.sub {
  margin-top: 14px;
  color: var(--muted);
  max-width: 70ch;
  line-height: 1.7;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec {
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  color: var(--text);
  font-family: var(--mono);
  font-weight: 600;
}
.table {
  border-top: 1px solid var(--line);
}
.thead,
.trow {
  display: grid;
  grid-template-columns: 1.2fr 2fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 11px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.thead {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
}
.name {
  color: var(--text);
}
.trow .pill {
  margin-right: 6px;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
}
.note {
  font-size: 12.5px;
  line-height: 1.7;
}
</style>
