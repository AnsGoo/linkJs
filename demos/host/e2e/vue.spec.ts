import { test, expect } from '@playwright/test';

// 宿主壳层渲染（远程应用若未运行不影响本断言：宿主自身内容仍在 light DOM）。
test('renders the host shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header h1').first()).toHaveText('I am host app!');
});
