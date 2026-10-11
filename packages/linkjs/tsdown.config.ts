import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  entry: { index: 'src/index.ts', vue: 'src/vue.ts' },
  outDir: 'dist',
  sourcemap: true,
  exports: false,
  plugins: [],
  // ...config options
});
