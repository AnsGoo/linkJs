<script setup lang="ts">
import CodeBlock from '../components/CodeBlock.vue';
import { createRemoteComponent } from 'linkjs/vue';

// 同一远程组件，分别以「普通 DOM」与「Shadow DOM」渲染，对比样式隔离效果。
const Plain = createRemoteComponent('remoteApp/HelloWorld', { shadow: false });
const Isolated = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });

const code = `import { createRemoteComponent } from 'linkjs/vue';

const Plain = createRemoteComponent('remoteApp/HelloWorld', { shadow: false });
const Isolated = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>Shadow 隔离</h1>
      <p class="sub">
        <code>createRemoteComponent(..., { shadow: true })</code> 把远程组件连同样式放进影子树，
        宿主页面里看似“污染性”的全局样式也无法影响它。
      </p>
    </header>

    <CodeBlock title="ShadowView.vue" :code="code" />

    <div class="compare">
      <section class="zone">
        <div class="zone-head">
          <span class="mono faint">shadow: false</span>
          <span class="pill is-error"><span class="dot" />全局样式会渗入</span>
        </div>
        <div class="leak-zone panel">
          <Plain msg="普通 DOM" :age="18" name="plain" sex="male" />
        </div>
      </section>

      <section class="zone">
        <div class="zone-head">
          <span class="mono faint">shadow: true</span>
          <span class="pill is-loaded"><span class="dot" />已隔离</span>
        </div>
        <div class="leak-zone panel">
          <Isolated msg="Shadow DOM" :age="18" name="isolated" sex="male" />
        </div>
      </section>
    </div>
  </div>
</template>

<!-- 全局（非 scoped）样式：用于演示“宿主样式渗入” -->
<style>
.leak-zone div,
.leak-zone h1,
.leak-zone p,
.leak-zone h3,
.leak-zone a {
  color: #ff5c8a !important;
  font-family: 'Comic Sans MS', 'Bradley Hand', cursive !important;
  letter-spacing: 0.04em;
}
</style>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.head {
  max-width: 760px;
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
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 12px;
}
.leak-zone {
  padding: 18px;
  min-height: 160px;
}

@media (max-width: 860px) {
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
