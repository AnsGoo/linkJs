import { defineConfig } from 'tsdown';

export default defineConfig({
  exports: true,
  dts: true,
  dtsDir: 'dist',
  entry: 'src/index.ts',
  outDir: 'dist',
  exports: {
    devExports: 'development',
  },
  // ...config options
});
