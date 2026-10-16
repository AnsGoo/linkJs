#!/usr/bin/env node
/**
 * 一键启动示例：remote-lib(:4001) → remoteApp(:8081) → share-remote(:8091) → showcase(:5190)。
 *
 * 之所以**按顺序并等待就绪**：remoteApp/showcase 的 `consumeTypes` 需要拉取下游 remote 的
 * manifest 生成虚拟模块，若下游未就绪会 404 → 虚拟模块失效 → remote 无法 expose（超时）。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const children = [];

function run(args, label) {
  const child = spawn('pnpm', args, { cwd: repoRoot, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    if (code) {
      console.error(`[dev-all] ${label} 退出，code=${code}`);
    }
  });
  return child;
}

async function waitFor(url, { timeout = 180_000, interval = 500 } = {}) {
  const start = Date.now();
  process.stdout.write(`[dev-all] 等待 ${url} …`);
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        process.stdout.write(' ok\n');
        return true;
      }
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  process.stdout.write(' 超时（继续）\n');
  return false;
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill('SIGINT');
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[dev-all] 构建 workspace 包…');
await new Promise((resolve) => {
  const build = spawn('pnpm', ['build'], { cwd: repoRoot, stdio: 'inherit' });
  build.on('exit', () => resolve());
});

console.log('[dev-all] 启动 remote-lib (:4001)…');
run(['--filter', 'vue-components-starter', 'dev'], 'remote-lib');
await waitFor('http://localhost:4001/mf/manifest.json');

console.log('[dev-all] 启动 remoteApp (:8081)…');
run(['--filter', 'RemoteApp', 'dev'], 'remoteApp');
await waitFor('http://localhost:8081/manifest.json');
// remoteApp 的**类型服务**(:4002) 供宿主 consumeTypes 拉类型；就绪前宿主会 404。
await waitFor('http://localhost:4002/mf/manifest.json');

console.log('[dev-all] 启动 share-remote (:8091)…');
run(['--filter', 'ShareRemote', 'dev'], 'share-remote');
await waitFor('http://localhost:8091/manifest.json');

console.log('[dev-all] 启动 showcase (:5190)…');
run(['--filter', 'linkjs-showcase', 'dev'], 'showcase');
await waitFor('http://localhost:5190/');

console.log('\n[dev-all] ✓ 全部就绪 → 打开 http://localhost:5190 （Ctrl+C 停止全部）\n');
