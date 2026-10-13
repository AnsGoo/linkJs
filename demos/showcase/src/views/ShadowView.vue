<script setup lang="ts">
import CodeBlock from '../components/CodeBlock.vue';
import { createRemoteComponent } from 'linkjs/vue';

// 同一远程组件，分别以「普通 DOM」与「Shadow DOM」渲染，对比样式隔离效果。
const Plain = createRemoteComponent('remoteApp/HelloWorld', { shadow: false });
const Isolated = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });

const code = `import { createRemoteComponent } from 'linkjs/vue';

const Plain = createRemoteComponent('remoteApp/HelloWorld', { shadow: false });
const Isolated = createRemoteComponent('remoteApp/HelloWorld', { shadow: true });`;

const boundary = [
  { k: '宿主全局样式', v: 'light DOM 会渗入；Shadow DOM 完全隔离。', pass: 'yes' },
  { k: 'CSS 自定义属性', v: '沿 DOM 继承，可跨影子边界（可用于传设计令牌）。', pass: 'yes' },
  { k: 'DOM 事件', v: '影子树内事件会重定向到宿主（retarget）。', pass: 'note' },
  { k: '样式捕获', v: 'loadApp/loadLib({ shadow:true }) 在加载期把远端样式收进影子树。', pass: 'yes' },
];
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>Shadow 隔离</h1>
      <p class="sub">
        <code>createRemoteComponent(..., { shadow: true })</code> 把远程组件连同样式放进影子树；
        宿主页面里看似“污染性”的全局样式也无法影响它，而设计令牌（CSS 变量）仍可穿透。
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

    <section>
      <h3 class="sec">影子边界</h3>
      <div class="facts">
        <div v-for="f in boundary" :key="f.k" class="fact">
          <span class="f-k">{{ f.k }}</span>
          <span class="f-v">{{ f.v }}</span>
          <span class="f-badge" :class="f.pass">{{ f.pass === 'yes' ? '穿透/生效' : '重定向' }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<!--
  全局（非 scoped）样式：演示“宿主样式渗入” light DOM。
  注意：选择器**刻意不包含 `div`** —— 影子宿主是一个 div，若对它设置 color/font 这类
  可继承属性，会经继承穿透进影子树，导致隔离面板看起来“不是原样式”。这里只命中
  light DOM 里的文本元素，隔离面板即可保持远端原样。
-->
<style>
.leak-zone h1,
.leak-zone p,
.leak-zone h3,
.leak-zone a,
.leak-zone span,
.leak-zone strong {
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
  min-height: 150px;
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
.facts {
  border-top: 1px solid var(--line);
}
.fact {
  display: grid;
  grid-template-columns: 150px 1fr 100px;
  gap: 16px;
  align-items: baseline;
  padding: 13px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.f-k {
  font-weight: 600;
}
.f-v {
  color: var(--muted);
}
.f-badge {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--accent);
  text-align: right;
}
.f-badge.note {
  color: var(--indigo);
}
@media (max-width: 860px) {
  .compare,
  .fact {
    grid-template-columns: 1fr;
  }
}
</style>
