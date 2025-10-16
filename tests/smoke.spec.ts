import { test, expect } from '@playwright/test';

const tools = [
  { path: '/tools/pdf-compressor/index.html', heading: 'Step 1 – Select a PDF' },
  { path: '/tools/image-resizer/index.html', heading: 'Upload image' },
  { path: '/tools/bulk-image-compressor/index.html', heading: 'Add your images' },
  { path: '/tools/metadata-scrubber/index.html', heading: 'Select an image' },
  { path: '/tools/video-player/index.html', heading: 'Open a local video' },
  { path: '/tools/code-editor/index.html', heading: 'HTML, CSS & JavaScript editors' },
  { path: '/tools/newsletter-builder/index.html', heading: 'How to use this tool' },
];

test('dashboard lists available tools', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('.app-title')).toHaveText('Intranet Tools');
  await expect(page.locator('[data-tool-card]')).toHaveCount(tools.length);
});

for (const tool of tools) {
  test(`tool page loads: ${tool.path}`, async ({ page }) => {
    await page.goto(tool.path);
    await expect(page.getByRole('heading', { name: tool.heading })).toBeVisible();
  });
}
