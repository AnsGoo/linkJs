<script setup lang="ts">
import { ref } from 'vue';
import { getInstance, loadApp } from 'linkjs';
import CodeBlock from '../components/CodeBlock.vue';

const result = ref('');
const busy = ref('');
const sriHost = `${location.origin}/sri/`;

async function load(kind: 'ok' | 'bad'): Promise<void> {
  busy.value = kind;
  result.value = '';
  // ok / bad 用不同 appName；bad 走独立脚本 URL（见 bad.html）以绕开模块缓存做 SRI 校验。
  const name = kind === 'ok' ? 'sriOk' : 'sriBad';
  try {
    const mod = (await loadApp(name, { host: sriHost, entry: kind === 'ok' ? 'ok.html' : 'bad.html' })) as { hello?: () => string } | null;
    result.value = `✓ 加载成功：${mod?.hello?.() ?? '(已暴露模块)'}`;
  } catch (error) {
    result.value = `✗ 加载失败（SRI 校验未通过）：${String((error as Error).message || error)}`;
  } finally {
    busy.value = '';
  }
}

function readIntegrity(): void {
  const entry = getInstance().remotes.get('sriOk');
  result.value = entry?.integrity
    ? `已加载 manifest 的 integrity：${JSON.stringify(entry.integrity)}`
    : '（内置静态远端通过 HTML 的 <script integrity> 声明 SRI；运行时由 loader 透传。）';
}

const code = `<!-- 远程入口 HTML 声明 SRI（宿主 loadApp 会读取并透传到注入的 <script integrity>） -->
<script type="module" src="./entry.js"
        integrity="sha384-9WCjGwb..."><\\/script>

<!-- 脚本哈希不匹配 → 浏览器拒绝执行 → loadApp 失败 -->
<script type="module" src="./entry.js"
        integrity="sha384-AAAA..."><\\/script>

// CSP nonce：远程 HTML 的 <script nonce> / <link nonce> 会被 loader 透传，
// 配合服务端 Content-Security-Policy 的 nonce 白名单即可放行动态注入的资源。`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>安全：CSP nonce / SRI</h1>
      <p class="sub">
        远程入口 HTML 中的 <code>&lt;script integrity&gt;</code> 会被 <code>loadApp</code> 读取并透传到 动态注入的脚本（<b
          >子资源完整性 SRI</b
        >）；<code>&lt;script nonce&gt;</code> / <code>&lt;link nonce&gt;</code>
        同样透传，配合服务端 CSP 白名单放行。下面用同一脚本 + 正确/错误哈希演示 SRI 拦截。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">SRI 校验</h3>
          <div class="controls">
            <button class="btn btn-primary" :disabled="!!busy" @click="load('ok')">加载 ok.html（正确哈希）</button>
            <button class="btn" :disabled="!!busy" @click="load('bad')">加载 bad.html（错误哈希）</button>
            <button class="btn" :disabled="!!busy" @click="readIntegrity">查看 integrity</button>
          </div>
          <p class="result mono">{{ result || '（尚未操作）' }}</p>
        </section>

        <CodeBlock title="SRI / CSP nonce" :code="code" />
      </div>

      <div class="col">
        <section class="panel block">
          <h3 class="sec">说明</h3>
          <ul class="notes">
            <li><b>SRI</b>：比对脚本哈希，防篡改；不匹配则浏览器拒绝执行，<code>loadApp</code> 抛错。</li>
            <li>
              <b>CSP nonce</b>：<code>&lt;script nonce&gt;</code> / <code>&lt;link nonce&gt;</code> 由 loader 透传， 需服务端下发
              <code>Content-Security-Policy: script-src 'nonce-…'</code> 才能生效（本机未配 CSP 头， 故仅演示透传语义）。
            </li>
            <li><b>构建期生成</b>：<code>unplugin-linkjs</code> 可产出 manifest 的 <code>integrity</code> 映射， 运行时按路径匹配校验。</li>
          </ul>
        </section>

        <section class="panel block">
          <h3 class="sec">静态入口</h3>
          <ul class="files">
            <li class="mono">public/sri/entry.js（暴露 sriOk）</li>
            <li class="mono">public/sri/ok.html（正确哈希）</li>
            <li class="mono">public/sri/bad.html（错误哈希）</li>
          </ul>
        </section>
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
  max-width: 880px;
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
  grid-template-columns: 1.05fr 0.95fr;
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
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.result {
  margin: 0;
  font-size: 12.5px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  word-break: break-all;
}
.notes {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.6;
}
.notes code {
  color: var(--accent);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 4px;
}
.files {
  list-style: none;
  margin: 0;
  padding: 0;
}
.files li {
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
.files li:last-child {
  border-bottom: none;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
