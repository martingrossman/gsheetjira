import { test, expect } from '@playwright/test';
import C from '../Core.js';

test.use({ viewport: { width: 900, height: 950 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ blank }) => {
    const key = 'test.quick-batch.backend';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      issues: [{ ...blank, id: 'PRJ-1', type: 'Epic', summary: 'Batch epic', version: 'epic-v1', rank: 1000 }],
      receipts: {}, sequence: 1
    }));
    const h = window.quickBatchCloud = { backend: JSON.parse(localStorage.getItem(key)), requests: [], batches: [] };
    const accept = (input, operationId = input.operationId) => {
      let saved = h.backend.receipts[operationId];
      if (!saved) {
        saved = { ...blank, ...input, id: `PRJ-${++h.backend.sequence}`, version: `saved-${h.backend.sequence}`, rank: h.backend.sequence * 1000 };
        delete saved._draftKey; delete saved.operationId;
        h.backend.receipts[operationId] = saved; h.backend.issues.push(saved);
        localStorage.setItem(key, JSON.stringify(h.backend));
      }
      return saved;
    };
    window.finishQuickSingle = index => {
      const request = h.requests[index];
      request.success(accept(request.input));
    };
    window.finishQuickBatch = (index, outcome = 'success') => {
      const request = h.batches[index], items = [], errors = [];
      request.items.forEach((item, itemIndex) => {
        if (outcome === 'partial' && itemIndex === 1) errors.push({ index: itemIndex, message: 'Batch item needs retry' });
        else items.push({ index: itemIndex, issue: accept(item.input, item.operationId) });
      });
      if (outcome === 'lost') request.failure({ message: 'Batch acknowledgement lost' });
      else request.success({ items, errors });
    };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(handler) { this.success = handler; return this; },
      withFailureHandler(handler) { this.failure = handler; return this; },
      getProject() { queueMicrotask(() => this.success({ issues: h.backend.issues, mode: 'personal', quickBatchCreate: true, comments: {}, settings: [], spreadsheetUrl: '' })); },
      saveIssue(input, version) { h.requests.push({ input, version, success: this.success, failure: this.failure }); },
      createIssuesBatch(items) { h.batches.push({ items, success: this.success, failure: this.failure }); }
    }; } });
  }, { blank: C.blank() });
  await page.goto('/#gantt');
  await expect(page.locator('.gantt-grid')).toBeVisible();
});

const popup = page => page.locator('[data-gantt-quick-form]');
const titleInput = page => popup(page).locator('[name="summary"]');
const pending = page => page.locator('.gantt-row[data-pending-quick]');
const counts = page => page.evaluate(() => ({ singles: quickBatchCloud.requests.length, batches: quickBatchCloud.batches.length }));

async function queueThree(page) {
  await page.locator('[data-gantt-add="PRJ-1"]').click();
  await titleInput(page).fill('First story'); await titleInput(page).press('Enter');
  await expect.poll(() => counts(page)).toEqual({ singles: 1, batches: 0 });
  await popup(page).locator('[name="kind"]').selectOption('Task');
  await titleInput(page).fill('Second task'); await titleInput(page).press('Enter');
  await popup(page).locator('[name="kind"]').selectOption('Story');
  await titleInput(page).fill('Third story'); await titleInput(page).press('Enter');
  await expect(pending(page)).toHaveCount(3);
  await expect(pending(page).filter({ hasText: 'Second task' })).toContainText('Queued');
  await expect(pending(page).filter({ hasText: 'Third story' })).toContainText('Queued');
  expect(await counts(page)).toEqual({ singles: 1, batches: 0 });
  await page.evaluate(() => finishQuickSingle(0));
  await expect.poll(() => counts(page)).toEqual({ singles: 1, batches: 1 });
  await expect(pending(page)).toHaveCount(2);
}

test('the first create starts immediately and two queued children share one batch request', async ({ page }) => {
  await queueThree(page);
  const requests = await page.evaluate(() => ({ first: quickBatchCloud.requests[0].input, batch: quickBatchCloud.batches[0].items }));
  expect(requests.batch).toHaveLength(2);
  expect(requests.batch.map(item => ({ title: item.input.summary, type: item.input.type, parentId: item.input.parentId }))).toEqual([
    { title: 'Second task', type: 'Task', parentId: 'PRJ-1' },
    { title: 'Third story', type: 'Story', parentId: 'PRJ-1' }
  ]);
  expect(new Set([requests.first.operationId, ...requests.batch.map(item => item.operationId)]).size).toBe(3);
  expect(requests.batch.every(item => item.input._draftKey.startsWith('quick-'))).toBe(true);
  await expect(pending(page).first()).toContainText('Saving');
  await expect(page.locator('#sync-status')).not.toHaveText('Synced with Sheets');
  await titleInput(page).fill('Next unsent story');
  await page.evaluate(() => finishQuickBatch(0));
  await expect(pending(page)).toHaveCount(0);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  await expect(titleInput(page)).toHaveValue('Next unsent story');
  expect(await counts(page)).toEqual({ singles: 1, batches: 1 });
  const saved = await page.evaluate(() => quickBatchCloud.backend.issues.filter(issue => issue.type !== 'Epic'));
  expect(saved.map(issue => issue.summary)).toEqual(['First story', 'Second task', 'Third story']);
  expect(new Set(saved.map(issue => issue.id)).size).toBe(3);
});

test('an indexed batch error keeps only its failed draft and retries the same operation individually', async ({ page }) => {
  await queueThree(page);
  const operationId = await page.evaluate(() => quickBatchCloud.batches[0].items[1].operationId);
  await page.evaluate(() => finishQuickBatch(0, 'partial'));
  await expect(pending(page)).toHaveCount(1);
  await expect(pending(page)).toContainText('Third story');
  await expect(pending(page)).toContainText('Save unconfirmed');
  await expect(pending(page)).toContainText('Batch item needs retry');
  await expect(page.locator('#sync-status')).not.toHaveText('Synced with Sheets');
  await page.locator('[data-view="gantt"]').first().click();
  await pending(page).getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => counts(page)).toEqual({ singles: 2, batches: 1 });
  expect(await page.evaluate(() => quickBatchCloud.requests[1].input.operationId)).toBe(operationId);
  await page.evaluate(() => finishQuickSingle(1));
  await expect(pending(page)).toHaveCount(0);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  expect(await page.evaluate(() => quickBatchCloud.backend.issues.filter(issue => issue.summary === 'Third story').length)).toBe(1);
});

test('a lost batch acknowledgement survives reload and each original operation replays without duplicates', async ({ page }) => {
  await queueThree(page);
  const operationIds = await page.evaluate(() => quickBatchCloud.batches[0].items.map(item => item.operationId));
  await page.evaluate(() => finishQuickBatch(0, 'lost'));
  await expect(pending(page)).toHaveCount(2);
  await expect(pending(page).first()).toContainText('Save unconfirmed');
  await page.reload();
  await expect(pending(page)).toHaveCount(2);
  for (const [index, title] of ['Second task', 'Third story'].entries()) {
    const row = pending(page).filter({ hasText: title });
    await row.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect.poll(async () => (await counts(page)).singles).toBe(index + 1);
    expect(await page.evaluate(index => quickBatchCloud.requests[index].input.operationId, index)).toBe(operationIds[index]);
    await page.evaluate(index => finishQuickSingle(index), index);
  }
  await expect(pending(page)).toHaveCount(0);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  const saved = await page.evaluate(() => quickBatchCloud.backend.issues.filter(issue => issue.type !== 'Epic'));
  expect(saved.map(issue => issue.summary)).toEqual(['First story', 'Second task', 'Third story']);
  expect(new Set(saved.map(issue => issue.id)).size).toBe(3);
});

test('a legacy queue-only snapshot reuses original operations after another tab already saved its items', async ({ page }) => {
  await queueThree(page);
  const snapshot = await page.evaluate(() => quickBatchCloud.batches[0].items.map(item => ({
    operationId: item.operationId,
    queued: { draftKey: item.input._draftKey, title: item.input.summary, kind: item.input.type, status: item.input.status, parentId: item.input.parentId }
  })));
  await page.evaluate(() => finishQuickBatch(0, 'lost'));
  await expect(pending(page)).toHaveCount(2);
  await expect(pending(page).first()).toContainText('Save unconfirmed');
  // Emulate a stale queue snapshot from another tab, without its later retry-draft writes.
  await page.evaluate(snapshot => {
    localStorage.removeItem('sheetflow.pending-drafts.v1');
    localStorage.setItem('sheetflow.quick-queue.v1', JSON.stringify(snapshot.map(item => item.queued)));
  }, snapshot);
  await page.reload();
  await expect.poll(() => counts(page)).toEqual({ singles: 0, batches: 1 });
  expect(await page.evaluate(() => quickBatchCloud.batches[0].items.map(item => item.operationId))).toEqual(snapshot.map(item => item.operationId));
  await page.evaluate(() => finishQuickBatch(0));
  await expect(pending(page)).toHaveCount(0);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  const saved = await page.evaluate(() => quickBatchCloud.backend.issues.filter(issue => issue.type !== 'Epic'));
  expect(saved.map(issue => issue.summary)).toEqual(['First story', 'Second task', 'Third story']);
  expect(new Set(saved.map(issue => issue.id)).size).toBe(3);
});
