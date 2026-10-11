<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** 根节点（remote 名）。 */
  root: string;
  /** 有向边：[from, to]。 */
  edges: Array<[string, string]>;
  /** 节点展示名覆盖（缺省用节点 id）。 */
  labels?: Record<string, string>;
}>();

const labelOf = (name: string) => props.labels?.[name] ?? name;

interface Placed {
  name: string;
  x: number;
  y: number;
  root: boolean;
}
interface Link {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const COL_W = 190;
const ROW_H = 46;
const NODE_W = 140;
const NODE_H = 30;
const PAD_X = 16;
const PAD_Y = 14;

const layout = computed(() => {
  const adj = new Map<string, string[]>();
  const names = new Set<string>([props.root]);
  for (const [from, to] of props.edges) {
    names.add(from);
    names.add(to);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const level = new Map<string, number>([[props.root, 0]]);
  const queue: string[] = [props.root];
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
  for (const n of names) if (!level.has(n)) level.set(n, maxLevel + 1);

  const cols = new Map<number, string[]>();
  for (const n of names) {
    const l = level.get(n)!;
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l)!.push(n);
  }

  const maxRows = Math.max(1, ...[...cols.values()].map((a) => a.length));
  const width = PAD_X * 2 + cols.size * COL_W;
  const height = PAD_Y * 2 + maxRows * ROW_H;

  const pos = new Map<string, { x: number; y: number }>();
  const nodes: Placed[] = [];
  for (const [l, arr] of cols) {
    arr.sort();
    const startY = PAD_Y + ((maxRows - arr.length) * ROW_H) / 2;
    arr.forEach((n, i) => {
      const x = PAD_X + l * COL_W + (COL_W - NODE_W) / 2;
      const y = startY + i * ROW_H + (ROW_H - NODE_H) / 2;
      pos.set(n, { x, y });
      nodes.push({ name: n, x, y, root: n === props.root });
    });
  }

  const links: Link[] = [];
  for (const [from, to] of props.edges) {
    const a = pos.get(from);
    const b = pos.get(to);
    if (!a || !b) continue;
    links.push({ key: `${from}->${to}`, x1: a.x + NODE_W, y1: a.y + NODE_H / 2, x2: b.x, y2: b.y + NODE_H / 2 });
  }

  return { width, height, nodes, links };
});
</script>

<template>
  <div class="topo">
    <svg :width="layout.width" :height="layout.height" :viewBox="`0 0 ${layout.width} ${layout.height}`">
      <path
        v-for="l in layout.links"
        :key="l.key"
        class="topo-link"
        :d="`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`"
      />
      <g v-for="n in layout.nodes" :key="n.name" :transform="`translate(${n.x}, ${n.y})`">
        <rect class="topo-node" :class="{ root: n.root }" :width="140" :height="30" rx="7" />
        <text class="topo-label" x="70" y="19" text-anchor="middle">{{ labelOf(n.name) }}</text>
      </g>
    </svg>
  </div>
</template>
