import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 扩展页面（DevTools 面板 + 工具栏弹窗）用 Vue 编写、Vite 构建到 dist/。
// public/ 里的 manifest/background/devtools/icons 会原样拷贝到 dist 根。
export default defineConfig({
  plugins: [vue()],
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: fileURLToPath(new URL('./panel.html', import.meta.url)),
        popup: fileURLToPath(new URL('./popup.html', import.meta.url)),
      },
    },
  },
});
