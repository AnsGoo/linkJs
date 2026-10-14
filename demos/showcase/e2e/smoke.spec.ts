import { test, expect } from '@playwright/test';

test('总览页渲染依赖图', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1', { hasText: '远程依赖' })).toBeVisible();
  await expect(page.locator('.graph')).toBeVisible();
});

test('运行时加载 remoteApp → remote-lib 依赖预览渲染', async ({ page }) => {
  await page.goto('/runtime');
  await page.getByRole('button', { name: '加载 remoteApp' }).click();
  // 预览 stage 内渲染出 remote-lib（shadow 内文本，Playwright 可穿透）
  await expect(page.locator('.stage').getByText('My RemoteLib', { exact: false })).toBeVisible();
});

test('静态导入页渲染远程组件', async ({ page }) => {
  await page.goto('/static');
  await expect(page.locator('h1', { hasText: "来自 'remoteApp' 的静态 import" })).toBeVisible();
  await expect(page.getByText('My RemoteLib VerySimple Component', { exact: false }).first()).toBeVisible();
});

test('Expose 依赖页列出各 expose 的 deps', async ({ page }) => {
  await page.goto('/exposes');
  await expect(page.locator('.trow', { hasText: 'PiniaCounter' })).toBeVisible();
  await expect(page.locator('.trow', { hasText: 'HelloWorld' })).toContainText('vue');
});
