import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// 冒烟 e2e：假定展示站(:5190) 与两个远程(:8081 / :4001) 就绪；未起则自动启动（reuseExistingServer）。
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter vue-components-starter dev',
      cwd: repoRoot,
      url: 'http://localhost:4001/mf/manifest.json',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter RemoteApp dev',
      cwd: repoRoot,
      url: 'http://localhost:8081/',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5190/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
