import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`workspace navigation and controls remain reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#kanban');
    await expect(page.locator('#sync-status')).toHaveText('Saved in this browser');
    await expect(page.locator('[data-view]')).toHaveCount(3);
    await expect(page.locator('.page-heading, #stats')).toHaveCount(0);
    expect((await page.locator('#view-content').boundingBox()).y).toBeLessThan(viewport.height);
    await page.locator('#search').fill('guide');
    for (const view of ['sheet', 'gantt', 'kanban']) {
      await page.locator(`[data-view="${view}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${view}$`));
      await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#search')).toHaveValue('guide');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.locator('#search').fill('');
    await page.locator('#workspace-filters > summary').click();
    await page.locator('#priority-filter').selectOption('High');
    await expect(page.locator('#active-filter-chips')).toContainText('High');
    await page.locator('#workspace-filters > summary').click();
    await expect(page.locator('#active-filter-chips')).toBeVisible();
    await page.locator('[data-remove-filter="priority"]').click();
    await page.locator('.workspace-saved-views > summary').click();
    await expect(page.locator('#save-view-open')).toBeVisible();
    await page.locator('#save-view-open').click();
    await expect(page.locator('#saved-view-dialog')).toBeVisible();
    await page.locator('#saved-view-cancel').click();
    await page.locator('.workspace-options > summary').click();
    await expect(page.locator('#add-epic')).toBeVisible();
    await expect(page.locator('#epic-nav')).toBeVisible();
    await expect(page.locator('#help-button')).toBeVisible();
    await expect(page.locator('#export')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#create-issue').click();
    await expect(page.locator('#issue-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#issue-dialog')).not.toBeVisible();
  });
}

test('view hashes, history and existing keyboard shortcuts remain usable', async ({ page }) => {
  await page.goto('/#gantt');
  await expect(page.locator('#view-title')).toHaveText('Gantt');
  await page.keyboard.press('1'); await expect(page).toHaveURL(/#sheet$/);
  await page.keyboard.press('2'); await expect(page).toHaveURL(/#kanban$/);
  await page.keyboard.press('3'); await expect(page).toHaveURL(/#gantt$/);
  await page.goBack(); await expect(page.locator('#view-title')).toHaveText('Kanban');
  await page.keyboard.press('/'); await expect(page.locator('#search')).toBeFocused();
  await page.locator('#view-title').click();
  await page.keyboard.press('n'); await expect(page.locator('#issue-dialog')).toBeVisible();
  await expect(page.locator('#issue-form [name="summary"]')).toHaveValue('');
  await page.keyboard.press('Escape'); await expect(page.locator('#issue-dialog')).not.toBeVisible();
});
