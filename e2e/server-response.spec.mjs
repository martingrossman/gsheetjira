import { test, expect } from '@playwright/test';

test('a null cloud response shows connection guidance instead of a JavaScript property error', async ({ page }) => {
  await page.addInitScript(() => {
    let success;
    const runner = {
      withSuccessHandler(handler) { success = handler; return runner; },
      withFailureHandler() { return runner; },
      getProject() { queueMicrotask(() => success(null)); }
    };
    window.google = { script: { run: runner } };
  });
  await page.goto('/');
  await expect(page.locator('#error-banner')).toContainText('The server returned no valid project data');
  await expect(page.locator('#error-banner')).not.toContainText('Cannot read properties');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});
