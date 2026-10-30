import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sidebar = await readFile(new URL('../QuickAdd.html', import.meta.url), 'utf8');

test('sidebar restores an unconfirmed create and retries once with the same identity', async ({ page }) => {
  await page.route('**/sidebar-r3', route => route.fulfill({ contentType: 'text/html', body: sidebar }));
  await page.addInitScript(() => {
    const state = window.sidebarTest = { requests: [], receipts: JSON.parse(sessionStorage.getItem('test.sidebar.receipts') || '{}') };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(handler) { this.success = handler; return this; },
      withFailureHandler(handler) { this.failure = handler; return this; },
      getProject() { queueMicrotask(() => this.success({ spreadsheetUrl: 'https://example.invalid/sidebar-project', issues: [{ id: 'TEST-1', type: 'Epic', summary: 'Example Epic', rank: 1 }] })); },
      quickCreateIssue(title, type, parentId, operationId) {
        state.requests.push({ title, type, parentId, operationId });
        const existing = state.receipts[operationId];
        if (existing) { queueMicrotask(() => this.success(existing)); return; }
        state.receipts[operationId] = { id: 'TEST-2', summary: title, type, parentId };
        sessionStorage.setItem('test.sidebar.receipts', JSON.stringify(state.receipts));
        queueMicrotask(() => this.failure({ message: 'Response lost after commit.' }));
      }
    }; } });
  });
  await page.goto('/sidebar-r3');
  await expect(page.locator('#message')).toHaveText('Ready');
  await page.locator('#title').fill('Keep this title');
  await page.locator('#kind').selectOption('Story');
  await page.locator('#parent').selectOption('TEST-1');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.locator('#message')).toContainText('Submission unconfirmed');
  const operationId = await page.evaluate(() => sidebarTest.requests[0].operationId);
  await page.reload();
  await expect(page.locator('#title')).toHaveValue('Keep this title');
  await expect(page.locator('#kind')).toHaveValue('Story');
  await expect(page.locator('#parent')).toHaveValue('TEST-1');
  await expect(page.locator('#message')).toContainText('Submission unconfirmed');
  expect(await page.evaluate(() => sidebarTest.requests.length)).toBe(0);
  await page.getByRole('button', { name: 'Retry add', exact: true }).click();
  await expect(page.locator('#message')).toHaveText('TEST-2 added');
  await expect(page.locator('#title')).toHaveValue('');
  await expect(page.locator('#title')).toBeFocused();
  const persisted = await page.evaluate(() => ({ requests: sidebarTest.requests, receipts: Object.values(sidebarTest.receipts) }));
  expect(persisted.requests).toEqual([{ title: 'Keep this title', type: 'Story', parentId: 'TEST-1', operationId }]);
  expect(persisted.receipts).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#message')).toHaveText('Ready');
  await expect(page.locator('#title')).toHaveValue('');
});
