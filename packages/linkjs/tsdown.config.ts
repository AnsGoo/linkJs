import { defineConfig } from 'tsdown';

export default defineConfig({
  exports: true,
  dts: true,
  dtsDir: 'dist',
  entry: 'src/index.ts',
  outDir: 'dist',
  sourceMap: true,
  exports: {
    devExports: 'development',
  },
  plugins: [],
  // ...config options
});
