<script setup lang="ts">
import { computed } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { useSnapshot } from '../composables/useSnapshot';
// 构建期静态 import：unplugin-linkjs 把 <remote> 解析为虚拟模块（内部 createRemoteComponent）。
import { HelloWorld as RemoteAppHello } from 'remoteApp';
import { HelloWorld as RemoteLibHello } from 'remote-lib';

const { snapshot } = useSnapshot(1500);
const remotes = computed(() => snapshot.value.remotes || []);

const code = `import { HelloWorld as RemoteAppHello } from 'remoteApp';
import { HelloWorld as RemoteLibHello } from 'remote-lib';`;

const generated = `// unplugin-linkjs 解析 '<remote>' 生成的虚拟模块（示意）
import { createRemoteComponent } from 'linkjs/vue';

export const HelloWorld = /* @__PURE__ */ createRemoteComponent(
  "remoteApp/HelloWorld",
  { host: "http://localhost:8081", shadow: false },
);
export default { HelloWorld };`;
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
      <p class="sub">
        本示例构建期开启 <code>remoteImports: { shadow: true }</code>：导入的远程组件**连同其样式**
        自动进入影子树、与宿主样式互相隔离（对照见
        <RouterLink to="/shadow" class="inline-link">Shadow 隔离</RouterLink>）。关闭时则注入
        document（可能全局互相影响）。
      </p>
    </header>

    <div class="codes">
      <CodeBlock title="StaticView.vue" :code="code" />
      <CodeBlock title="生成的虚拟模块" :code="generated" />
    </div>

    <section class="stages">
      <div class="panel stage">
        <div class="stage-head">
          <span class="stage-label mono faint">remoteApp · HelloWorld</span>
          <span class="pill k-app">app</span>
        </div>
        <RemoteAppHello msg="来自 'remoteApp' 的静态 import" :age="18" name="from-host" sex="male" tst="math" />
      </div>
      <div class="panel stage">
        <div class="stage-head">
          <span class="stage-label mono faint">remote-lib · HelloWorld</span>
          <span class="pill k-lib">lib</span>
        </div>
        <RemoteLibHello />
      </div>
    </section>

    <section>
      <h3 class="sec">可用于静态 import 的 expose</h3>
      <div class="exposes">
        <div v-for="r in remotes" :key="r.name" class="expose-row">
          <span class="mono name">{{ r.name }}</span>
          <span class="mono faint host">{{ r.host }}</span>
        </div>
      </div>
      <p class="note faint">仅对在 <code>consumeTypes.remotes[].preload</code> 声明过的远程生成虚拟模块。</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.head {
  max-width: 760px;
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
  line-height: 1.7;
}
.inline-link {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
}
.codes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
.stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.stage {
  padding: 18px;
}
.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stage-label {
  font-size: 11px;
}
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 10px;
}
.exposes {
  border-top: 1px solid var(--line);
}
.expose-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 16px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.note {
  margin-top: 10px;
  font-size: 12.5px;
}
@media (max-width: 860px) {
  .codes,
  .stages {
    grid-template-columns: 1fr;
  }
}
</style>
