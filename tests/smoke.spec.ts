import { test, expect } from '@playwright/test';

const tools = [
  { path: '/tools/pdf-compressor/index.html', heading: 'Step 1 – Select a PDF' },
  { path: '/tools/image-resizer/index.html', heading: 'Upload image' },
];

test('dashboard lists available tools', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('.app-title')).toHaveText('Intranet Tools');
  await expect(page.locator('.card')).toHaveCount(6);
});

for (const tool of tools) {
  test(`tool page loads: ${tool.path}`, async ({ page }) => {
    await page.goto(tool.path);
    await expect(page.getByRole('heading', { name: tool.heading })).toBeVisible();
  });
}
