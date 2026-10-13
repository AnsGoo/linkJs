import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 该 demo 只用运行时能力（registry + loadApp + getRemote），无需 unplugin。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    cors: true,
  },
});
