import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  entry: 'src/index.ts',
  outDir: 'dist',
  sourcemap: true,
  exports: false,
  // 被 dev server 直接消费：不清理 outDir，避免重建瞬间文件缺失。
  clean: false,
  plugins: [],
  // ...config options
});
