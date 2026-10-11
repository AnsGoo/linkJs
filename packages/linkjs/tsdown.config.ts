import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  entry: { index: 'src/index.ts', vue: 'src/vue.ts' },
  outDir: 'dist',
  sourcemap: true,
  exports: false,
  // 不清理 outDir：被 dev server 直接消费时，clean 会在重建瞬间删除文件导致
  // "Does the file exist?"；配合稳定 chunk 名原地覆盖即可。
  clean: false,
  outputOptions: {
    chunkFileNames: 'chunks/[name].mjs',
  },
  plugins: [],
  // ...config options
});
