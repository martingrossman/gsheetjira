import { test, expect } from '@playwright/test';
import C from '../Core.js';

async function cloud(page) {
  await page.addInitScript(({ blank }) => {
    const h = window.intentHarness = { issues: [1, 2].map(n => ({ ...blank, id: `PRJ-${n}`, summary: `Task ${n}`, rank: n * 1000, version: `v${n}` })), requests: [], receipts: {}, sequence: 2 };
    h.finish = (index, outcome = 'ok') => {
      const r = h.requests[index];
      if (outcome === 'fail') return r.failure({ message: 'Temporary failure' });
      let saved = h.receipts[r.input.operationId];
      if (!saved) {
        const current = h.issues.find(i => i.id === r.input.id);
        if (current && current.version !== r.version) return r.failure({ message: 'This issue changed elsewhere.' });
        saved = { ...blank, ...current, ...r.input, id: current?.id || `PRJ-${++h.sequence}`, version: `saved-${index}` };
        delete saved.operationId; delete saved._draftKey;
        h.issues = [...h.issues.filter(i => i.id !== saved.id), saved];
        h.receipts[r.input.operationId] = saved;
      }
      if (outcome === 'lost') r.failure({ message: 'Acknowledgement lost' }); else r.success(structuredClone(saved));
    };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(fn) { this.success = fn; return this; },
      withFailureHandler(fn) { this.failure = fn; return this; },
      getProject() { queueMicrotask(() => this.success({ issues: structuredClone(h.issues), comments: {}, settings: [], mode: 'personal', spreadsheetUrl: '' })); },
      saveIssue(input, version) { h.requests.push({ input: structuredClone(input), version, success: this.success, failure: this.failure }); }
    }; } });
  }, { blank: C.blank() });
  await page.goto('/#sheet');
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toBeVisible();
}
const count = page => page.evaluate(() => intentHarness.requests.length);
const finish = (page, i, mode) => page.evaluate(([i, mode]) => intentHarness.finish(i, mode), [i, mode]);
const select = (page, field, value, id = 'PRJ-1') => page.locator(`[data-id="${id}"][data-field="${field}"]`).selectOption(value);
const drafts = page => page.evaluate(() => JSON.parse(localStorage.getItem('sheetflow.pending-drafts.v1') || '{}'));

for (const second of ['same field', 'different field']) test(`queued ${second} intent survives an older acknowledgement`, async ({ page }) => {
  await cloud(page);
  await select(page, 'priority', 'High');
  await expect.poll(() => count(page)).toBe(1);
  await select(page, second === 'same field' ? 'priority' : 'status', second === 'same field' ? 'Low' : 'Review');
  const newer = (await drafts(page))['PRJ-1'].operationId;
  expect(newer).not.toBe(await page.evaluate(() => intentHarness.requests[0].input.operationId));
  await finish(page, 0);
  await expect.poll(() => count(page)).toBe(2);
  expect((await drafts(page))['PRJ-1'].operationId).toBe(newer);
  expect(await page.evaluate(() => intentHarness.requests[1].version)).toBe('saved-0');
  await finish(page, 1);
  await expect.poll(() => drafts(page)).toEqual({});
  const saved = await page.evaluate(() => intentHarness.issues.find(i => i.id === 'PRJ-1'));
  expect(saved.priority).toBe(second === 'same field' ? 'Low' : 'High');
  expect(saved.status).toBe(second === 'same field' ? 'Backlog' : 'Review');
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toHaveValue(saved.priority);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
});

test('lost acknowledgement retries the original payload and identity', async ({ page }) => {
  await cloud(page); await select(page, 'priority', 'High'); await finish(page, 0, 'lost');
  await page.locator('#retry-save').click(); await expect.poll(() => count(page)).toBe(2);
  expect(await page.evaluate(() => intentHarness.requests[1].input)).toEqual(await page.evaluate(() => intentHarness.requests[0].input));
  await finish(page, 1); await expect.poll(() => drafts(page)).toEqual({});
  expect(await page.evaluate(() => Object.keys(intentHarness.receipts).length)).toBe(1);
});

test('a failed edit followed by new content uses a fresh identity', async ({ page }) => {
  await cloud(page); await select(page, 'priority', 'High'); await finish(page, 0, 'fail');
  await select(page, 'priority', 'Low'); await expect.poll(() => count(page)).toBe(2);
  expect(await page.evaluate(() => intentHarness.requests[1].input.operationId)).not.toBe(await page.evaluate(() => intentHarness.requests[0].input.operationId));
  await finish(page, 1); await expect.poll(() => drafts(page)).toEqual({});
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toHaveValue('Low');
});

test('independent issue acknowledgements can arrive in reverse order', async ({ page }) => {
  await cloud(page); await select(page, 'priority', 'High'); await select(page, 'priority', 'Low', 'PRJ-2');
  await expect.poll(() => count(page)).toBe(2); await finish(page, 1);
  expect((await drafts(page))['PRJ-1']).toBeTruthy();
  await expect(page.locator('#sync-status')).toContainText('Saving');
  await finish(page, 0); await expect.poll(() => drafts(page)).toEqual({});
});

for (const remote of [false, true]) test(`queued newer edit survives predecessor failure${remote ? ' and preserves remote changes' : ''}`, async ({ page }) => {
  await cloud(page); await select(page, 'priority', 'High'); await select(page, 'priority', 'Low');
  if (remote) await page.evaluate(() => { intentHarness.issues[0].version = 'remote'; intentHarness.issues[0].priority = 'Highest'; });
  await finish(page, 0, 'fail'); await expect.poll(() => count(page)).toBe(2);
  await finish(page, 1);
  if (remote) {
    await expect(page.locator('#compare-save')).toBeVisible();
    expect((await drafts(page))['PRJ-1'].input.priority).toBe('Low');
    expect(await page.evaluate(() => intentHarness.issues[0].priority)).toBe('Highest');
    await expect(page.locator('#sync-status')).not.toHaveText('Synced with Sheets');
  } else {
    await expect.poll(() => drafts(page)).toEqual({});
    await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toHaveValue('Low');
  }
});

test('autosave and manual Save retain the later detail value', async ({ page }) => {
  await cloud(page); await page.locator('[data-open="PRJ-1"]').click();
  await page.locator('textarea[name="description"]').fill('First description');
  await expect.poll(() => count(page)).toBe(1);
  await page.locator('textarea[name="description"]').fill('Second description');
  await page.locator('#save-issue').click(); await finish(page, 0);
  await expect.poll(() => count(page)).toBe(2);
  await expect(page.locator('textarea[name="description"]')).toHaveValue('Second description');
  await finish(page, 1); await expect(page.locator('#issue-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => intentHarness.issues.find(i => i.id === 'PRJ-1').description)).toBe('Second description');
  expect(await drafts(page)).toEqual({});
});

test('local successive edits survive reload without transient operation metadata', async ({ page }) => {
  await page.goto('/#sheet');
  await select(page, 'priority', 'High', 'PRJ-3'); await select(page, 'status', 'Review', 'PRJ-3');
  await expect.poll(() => drafts(page)).toEqual({}); await page.reload();
  await expect(page.locator('[data-id="PRJ-3"][data-field="priority"]')).toHaveValue('High');
  await expect(page.locator('[data-id="PRJ-3"][data-field="status"]')).toHaveValue('Review');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sheetflow.project.v1')).issues.some(i => i.operationId))).toBe(false);
});

for (const outcome of ['ok', 'lost']) test(`new issue edits reconcile the original create after ${outcome} acknowledgement`, async ({ page }) => {
  await cloud(page); await page.locator('#create-issue').click();
  await page.locator('[name="summary"]').fill('New item');
  await expect.poll(() => count(page)).toBe(1);
  await page.locator('textarea[name="description"]').fill('Later description');
  await expect.poll(async () => (await drafts(page)).__new__?.input.description).toBe('Later description');
  await finish(page, 0, outcome);
  await expect.poll(() => count(page)).toBe(2);
  if (outcome === 'lost') {
    expect(await page.evaluate(() => intentHarness.requests[1].input)).toEqual(await page.evaluate(() => intentHarness.requests[0].input));
    await finish(page, 1); await expect.poll(() => count(page)).toBe(3);
  }
  const updateIndex = outcome === 'lost' ? 2 : 1;
  expect(await page.evaluate(i => intentHarness.requests[i].input.id, updateIndex)).toBe('PRJ-3');
  // Another edit after the real ID arrives must still wait for this update.
  await page.locator('textarea[name="description"]').fill('Newest description');
  await expect.poll(async () => { const pending = await drafts(page); return (pending['PRJ-3'] || pending.__new__)?.input.description; }).toBe('Newest description');
  expect(await count(page)).toBe(updateIndex + 1);
  await finish(page, updateIndex); await expect.poll(() => count(page)).toBe(updateIndex + 2);
  await finish(page, updateIndex + 1); await expect.poll(() => drafts(page)).toEqual({});
  const items = await page.evaluate(() => intentHarness.issues.filter(i => i.summary === 'New item'));
  expect(items).toHaveLength(1); expect(items[0].description).toBe('Newest description');
});
