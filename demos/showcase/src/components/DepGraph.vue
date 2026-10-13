<script setup lang="ts">
import { computed } from 'vue';
import type { RemoteRow, ShareRow } from '../composables/useSnapshot';

const props = defineProps<{
  instanceName?: string;
  remotes: RemoteRow[];
  shares: ShareRow[];
}>();

type Kind = 'host' | 'app' | 'lib' | 'shared';

interface GraphNode {
  id: string;
  label: string;
  kind: Kind;
  status?: string;
  level: number;
  x: number;
  y: number;
}
interface GraphEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  dashed: boolean;
}

const COL = 210;
const ROW = 54;
const NODE_W = 158;
const NODE_H = 36;
const PAD_X = 18;
const PAD_Y = 16;

const graph = computed(() => {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, string[]>();
  const edges: Array<{ from: string; to: string; dashed: boolean }> = [];
  const seen = new Set<string>();

  const HOST = '__host__';
  nodes.set(HOST, { id: HOST, label: props.instanceName || 'HOST', kind: 'host', level: 0, x: 0, y: 0 });

  const link = (from: string, to: string, dashed: boolean) => {
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, dashed });
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  };

  for (const r of props.remotes || []) {
    const kind: Kind = r.type === 'lib' ? 'lib' : 'app';
    nodes.set(r.name, { id: r.name, label: r.name, kind, status: r.status, level: 1, x: 0, y: 0 });
    link(HOST, r.name, false);
    for (const dep of r.deps || []) {
      if (!nodes.has(dep.name)) {
        nodes.set(dep.name, { id: dep.name, label: dep.name, kind: 'shared', status: dep.status, level: 2, x: 0, y: 0 });
      }
      link(r.name, dep.name, false);
    }
    for (const dep of Object.keys(r.shared || {})) {
      if (!nodes.has(dep)) {
        nodes.set(dep, { id: dep, label: dep, kind: 'shared', level: 2, x: 0, y: 0 });
      }
      link(r.name, dep, false);
    }
  }

  // BFS level 校正
  const level = new Map<string, number>([[HOST, 0]]);
  const queue = [HOST];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) || []) {
      if (!level.has(next)) {
        level.set(next, (level.get(cur) || 0) + 1);
        queue.push(next);
      }
    }
  }
  let maxLevel = 0;
  for (const l of level.values()) maxLevel = Math.max(maxLevel, l);
  for (const n of nodes.values()) n.level = level.get(n.id) ?? maxLevel;

  const cols = new Map<number, GraphNode[]>();
  for (const n of nodes.values()) {
    if (!cols.has(n.level)) cols.set(n.level, []);
    cols.get(n.level)!.push(n);
  }
  const maxRows = Math.max(1, ...[...cols.values()].map((c) => c.length));
  const width = PAD_X * 2 + (cols.size - 1) * COL + NODE_W;
  const height = PAD_Y * 2 + maxRows * ROW;

  for (const [l, arr] of cols) {
    arr.sort((a, b) => {
      const order: Record<Kind, number> = { host: 0, app: 1, lib: 2, shared: 3 };
      return order[a.kind] - order[b.kind] || a.label.localeCompare(b.label);
    });
    const startY = PAD_Y + ((maxRows - arr.length) * ROW) / 2;
    arr.forEach((n, i) => {
      n.x = PAD_X + l * COL;
      n.y = startY + i * ROW + (ROW - NODE_H) / 2;
    });
  }

  const placed = new Map([...nodes.values()].map((n) => [n.id, n]));
  const links: GraphEdge[] = edges
    .map((e) => {
      const a = placed.get(e.from)!;
      const b = placed.get(e.to)!;
      return {
        key: `${e.from}->${e.to}`,
        x1: a.x + NODE_W,
        y1: a.y + NODE_H / 2,
        x2: b.x,
        y2: b.y + NODE_H / 2,
        active: b.status === 'loaded' || b.kind === 'host',
        dashed: e.dashed,
      };
    })
    .sort((a, b) => a.x1 - b.x1);

  return { width, height, nodes: [...nodes.values()], links };
});

const kindClass = (k: Kind) => `kn-${k}`;
</script>

<template>
  <div class="graph panel">
    <div class="graph-head">
      <span class="mono faint">dependency graph</span>
      <span class="legend">
        <i class="lg kn-host" /> host
        <i class="lg kn-app" /> app
        <i class="lg kn-lib" /> lib
        <i class="lg kn-shared" /> shared
      </span>
    </div>
    <div class="graph-scroll">
      <svg :width="graph.width" :height="graph.height" :viewBox="`0 0 ${graph.width} ${graph.height}`">
        <path
          v-for="l in graph.links"
          :key="l.key"
          class="edge"
          :class="{ active: l.active, dashed: l.dashed }"
          :d="`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`"
        />
        <g v-for="(n, i) in graph.nodes" :key="n.id" class="node" :style="{ animationDelay: `${i * 45}ms` }">
          <rect :x="n.x" :y="n.y" width="158" height="36" rx="9" :class="kindClass(n.kind)" />
          <circle v-if="n.status === 'loaded'" class="live" :cx="n.x + 13" :cy="n.y + 18" r="3.4" />
          <text :x="n.x + (n.status === 'loaded' ? 24 : 14)" :y="n.y + 22.5">{{ n.label }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.graph {
  overflow: hidden;
}
.graph-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--faint);
  font-family: var(--mono);
}
.lg {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  display: inline-block;
  margin-left: 8px;
}
.graph-scroll {
  padding: 8px 6px;
  overflow: auto;
}
svg {
  display: block;
}
.edge {
  fill: none;
  stroke: rgba(255, 255, 255, 0.14);
  stroke-width: 1.4;
}
.edge.active {
  stroke: color-mix(in oklab, var(--accent) 60%, transparent);
  stroke-width: 1.6;
}
.edge.dashed {
  stroke-dasharray: 5 5;
}
.edge {
  stroke-dasharray: 900;
  stroke-dashoffset: 900;
  animation: draw 1.1s var(--ease) forwards;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
.node {
  opacity: 0;
  animation: rise 0.5s var(--ease) forwards;
}
.node rect {
  fill: #0e1118;
  stroke: rgba(255, 255, 255, 0.14);
}
.node rect.kn-host {
  stroke: color-mix(in oklab, var(--amber) 55%, transparent);
}
.node rect.kn-app {
  stroke: rgba(102, 179, 255, 0.5);
}
.node rect.kn-lib {
  stroke: color-mix(in oklab, var(--indigo) 55%, transparent);
}
.node rect.kn-shared {
  stroke: color-mix(in oklab, var(--accent) 45%, transparent);
}
.node text {
  fill: var(--text);
  font-family: var(--mono);
  font-size: 11.5px;
}
.live {
  fill: var(--accent);
  animation: blink 1.8s ease-in-out infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
