import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  entry: 'src/index.ts',
  outDir: 'dist',
  sourcemap: true,
  exports: {
    devExports: 'development',
  },
  plugins: [],
  // ...config options
});
