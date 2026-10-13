<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';

// 由 unplugin-linkjs consumeTypes 生成（gitignore）。经其 dev 中间件以 text/plain 提供。
const dts = ref('// 加载中…');
onMounted(async () => {
  try {
    const res = await fetch('/src/linkjs-remotes.d.ts');
    dts.value = res.ok ? await res.text() : `// 未找到生成声明（${res.status}）：请先运行 dev 触发 consumeTypes`;
  } catch (e) {
    dts.value = `// 读取失败：${String((e as Error)?.message || e)}`;
  }
});

const lines = computed(() => dts.value.split('\n'));
const preview = computed(() => lines.value.slice(0, 34).join('\n'));
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>类型转发</h1>
      <p class="sub">
        宿主通过 <code>consumeTypes.remotes</code> 拉取远端 manifest 的 <code>.d.ts</code>，聚合为
        <code>declare module '&lt;remote&gt;' / '&lt;remote&gt;/&lt;Expose&gt;'</code>。于是
        <code>import { HelloWorld } from 'remoteApp'</code> 具备完整类型与编辑器补全。
      </p>
    </header>

    <div class="cols">
      <CodeBlock title="Host · 类型即用">
import { HelloWorld } from 'remoteApp';

// props 类型来自远端的 .d.ts
&lt;HelloWorld msg="typed" :age="18" name="host" sex="male" /&gt;
      </CodeBlock>

      <CodeBlock title="生成的聚合声明（预览）">{{ preview }}</CodeBlock>
    </div>

    <p class="note mono faint">共 {{ lines.length }} 行 · 源文件 src/linkjs-remotes.d.ts（consumeTypes 生成）</p>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.head {
  max-width: 780px;
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
.cols {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 20px;
  align-items: start;
}
.note {
  font-size: 12px;
}

@media (max-width: 860px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
