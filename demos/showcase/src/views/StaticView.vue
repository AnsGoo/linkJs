<script setup lang="ts">
import CodeBlock from '../components/CodeBlock.vue';
// 构建期静态 import：unplugin-linkjs 把 <remote> 解析为虚拟模块（内部 createRemoteComponent）。
import { HelloWorld as RemoteAppHello } from 'remoteApp';
import { HelloWorld as RemoteLibHello } from 'remote-lib';
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>构建期 import</h1>
      <p class="sub">
        直接 <code>import { HelloWorld } from 'remoteApp'</code>。unplugin-linkjs 在构建期把
        <code>&lt;remote&gt;</code> 解析成虚拟模块（内部为 <code>createRemoteComponent</code>），
        远程在 <code>consumeTypes.remotes</code> 声明 <code>preload</code> 后还会被提前预加载。
      </p>
    </header>

    <CodeBlock title="StaticView.vue">
import { HelloWorld as RemoteAppHello } from 'remoteApp';
import { HelloWorld as RemoteLibHello } from 'remote-lib';
    </CodeBlock>

    <div class="stages">
      <div class="panel stage">
        <span class="stage-label mono faint">remoteApp · HelloWorld</span>
        <RemoteAppHello msg="来自 'remoteApp' 的静态 import" :age="18" name="from-host" sex="male" tst="math" />
      </div>
      <div class="panel stage">
        <span class="stage-label mono faint">remote-lib · HelloWorld</span>
        <RemoteLibHello />
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
  max-width: 720px;
}
.head code {
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
.stages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stage {
  padding: 18px;
}
.stage-label {
  display: block;
  font-size: 11px;
  margin-bottom: 12px;
}
</style>
