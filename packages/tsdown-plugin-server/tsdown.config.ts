import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: true,
  target: 'esnext',
  platform: 'node',
  dtsDir: 'dist',
  entry: 'src/index.ts',
  outDir: 'dist',
  exports: false,
  // ...config options
});
