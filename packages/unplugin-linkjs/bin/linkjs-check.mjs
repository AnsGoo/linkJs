#!/usr/bin/env node
/**
 * `linkjs-check`：构建期之外的循环依赖检测（可在 CI 运行）。
 *
 * 用法：
 *   linkjs-check --remote <name>=<origin> [--remote ...] [--timeout <ms>]
 * 例：
 *   linkjs-check --remote remoteApp=http://localhost:8081 --remote remote-lib=http://localhost:4001
 *
 * 从各 remote 拉取 `manifest.json` 的 `remotes` 形成传递依赖图，检测并打印环 / 强连通分量；
 * 发现环退出码为 1。
 */
import { collectRemoteDependencyGraph, detectRemoteDependencyCycles, findCyclicComponents } from '../dist/index.mjs';

function parseArgs(argv) {
  const remotes = [];
  let timeout = 3000;
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
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: linkjs-check --remote <name>=<origin> [--remote ...] [--timeout <ms>]');
      process.exit(0);
    }
  }
  return { remotes, timeout };
}

const { remotes, timeout } = parseArgs(process.argv.slice(2));
if (remotes.length === 0) {
  console.error('[linkjs-check] 至少需要一个 --remote <name>=<origin>');
  process.exit(2);
}

const graph = await collectRemoteDependencyGraph(remotes, { timeout });
const cycles = detectRemoteDependencyCycles(graph);
const scc = findCyclicComponents(graph);

console.log('[linkjs-check] 远程依赖图：');
for (const [name, deps] of Object.entries(graph)) {
  console.log(`  ${name} -> ${deps.length ? deps.join(', ') : '(none)'}`);
}

if (cycles.length === 0) {
  console.log('[linkjs-check] ✓ 未发现循环依赖');
  process.exit(0);
}

console.error('[linkjs-check] ✗ 检测到循环依赖：');
for (const cycle of cycles) {
  console.error(`  ${cycle.join(' → ')}`);
}
if (scc.length > 0) {
  console.error('  需并载的强连通分量：');
  for (const comp of scc) {
    console.error(`    { ${comp.join(', ')} }`);
  }
}
process.exit(1);
