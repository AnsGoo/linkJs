#!/usr/bin/env node
/**
 * `linkjs-check`：构建期之外的循环依赖检测（可在 CI 运行）。
 *
 * 用法：
 *   linkjs-check --remote <name>=<origin> [--remote ...] [--timeout <ms>] [--max-nodes <n>]
 * 例：
 *   linkjs-check --remote remoteApp=http://localhost:8081 --remote remote-lib=http://localhost:4001
 *
 * 从各 remote 拉取 `manifest.json` 的 `remotes` 形成传递依赖图，检测并打印强连通分量（SCC）；
 * 发现环退出码为 1。无法解析（远端未起/404）或被截断的节点会以 ⚠ 告警提示，避免静默漏检。
 */
import { collectRemoteDependencyGraph, findCyclicComponents } from '../dist/index.mjs';

function parseArgs(argv) {
  const remotes = [];
  let timeout = 3000;
  let maxNodes = 200;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--remote') {
      const value = argv[++i] || '';
      const eq = value.indexOf('=');
      if (eq <= 0) {
        console.error(`[linkjs-check] 无效 --remote：${value}（应为 name=origin）`);
        process.exit(2);
      }
      remotes.push({ name: value.slice(0, eq), host: value.slice(eq + 1) });
    } else if (arg === '--timeout') {
      timeout = Number(argv[++i]) || timeout;
    } else if (arg === '--max-nodes') {
      maxNodes = Number(argv[++i]) || maxNodes;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: linkjs-check --remote <name>=<origin> [--remote ...] [--timeout <ms>] [--max-nodes <n>]');
      process.exit(0);
    }
  }
  return { remotes, timeout, maxNodes };
}

const { remotes, timeout, maxNodes } = parseArgs(process.argv.slice(2));
if (remotes.length === 0) {
  console.error('[linkjs-check] 至少需要一个 --remote <name>=<origin>');
  process.exit(2);
}

const unresolved = [];
let truncated;
const graph = await collectRemoteDependencyGraph(remotes, {
  timeout,
  maxNodes,
  onUnresolved: (info) => unresolved.push(info),
  onTruncated: (info) => {
    truncated = info;
  },
});
const components = findCyclicComponents(graph);

console.log('[linkjs-check] 远程依赖图：');
for (const [name, deps] of Object.entries(graph)) {
  console.log(`  ${name} -> ${deps.length ? deps.join(', ') : '(none)'}`);
}

for (const info of unresolved) {
  const detail =
    info.reason === 'no-host' ? '未声明 host' : info.reason === 'http-error' ? `manifest 返回 ${info.status}` : 'manifest 不可达/超时';
  console.error(`[linkjs-check] ⚠ 无法解析远程 "${info.name}"（${detail}）；其下游依赖未纳入检测，可能漏检环。`);
}
if (truncated) {
  console.error(`[linkjs-check] ⚠ 图超过 ${truncated.maxNodes} 个节点被截断（剩余 ${truncated.pending}），可能漏检；可调大 --max-nodes。`);
}

if (components.length === 0) {
  console.log('[linkjs-check] ✓ 未发现循环依赖');
  process.exit(0);
}

console.error('[linkjs-check] ✗ 检测到循环依赖（需并载的强连通分量）：');
for (const comp of components) {
  console.error(`  { ${comp.join(', ')} }`);
}
process.exit(1);
