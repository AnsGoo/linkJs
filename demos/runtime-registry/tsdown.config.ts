import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  dtsDir: 'dist',
  entry: 'src/index.ts',
  outDir: 'dist',
  source: true,
  exports: {
    devExports: 'development',
  },
  plugins: [],
  // ...config options
});
