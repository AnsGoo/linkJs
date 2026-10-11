import { test, expect } from '@playwright/test';

// 独立运行远程应用时，App 会以 msg="I am remote app" 渲染 HelloWorld。
test('renders the remote app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/I am remote app/).first()).toBeVisible();
});
