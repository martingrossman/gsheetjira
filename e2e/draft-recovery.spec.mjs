import { test, expect } from '@playwright/test';
import C from '../Core.js';

async function cloud(page) {
  await page.addInitScript(({ blank }) => {
    const stored = JSON.parse(sessionStorage.getItem('recovery-server') || 'null');
    const h = window.recoveryServer = { issues: stored?.issues || [1, 2].map(n => ({ ...blank, id: `PRJ-${n}`, summary: `Task ${n}`, rank: n * 1000, version: `v${n}` })), receipts: stored?.receipts || {}, requests: [], failRead: false };
    h.store = () => sessionStorage.setItem('recovery-server', JSON.stringify({ issues: h.issues, receipts: h.receipts }));
    h.finish = (index, outcome = 'ok') => {
      const r = h.requests[index];
      if (outcome === 'fail') return r.failure({ message: 'Temporary failure' });
      let saved = h.receipts[r.input.operationId];
      if (!saved) {
        const current = h.issues.find(i => i.id === r.input.id);
        if (current && current.version !== r.version) return r.failure({ message: 'This issue changed elsewhere.' });
        saved = { ...blank, ...current, ...r.input, id: current?.id || `PRJ-${h.issues.length + 1}`, version: `saved-${r.input.operationId}` };
        delete saved.operationId;
        h.issues = [...h.issues.filter(i => i.id !== saved.id), saved]; h.receipts[r.input.operationId] = saved; h.store();
      }
      if (outcome === 'lost') r.failure({ message: 'Acknowledgement lost' }); else r.success(structuredClone(saved));
    };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(fn) { this.success = fn; return this; },
      withFailureHandler(fn) { this.failure = fn; return this; },
      getProject() { queueMicrotask(() => h.failRead ? this.failure({ message: 'Read unavailable' }) : this.success({ issues: structuredClone(h.issues), comments: {}, settings: [], mode: 'personal', spreadsheetUrl: '' })); },
      saveIssue(input, version) { h.requests.push({ input: structuredClone(input), version, success: this.success, failure: this.failure }); },
      moveIssue(id, updates, version, operationId) { h.requests.push({ input: { id, ...updates, operationId }, version, mutation: 'moveIssue', success: this.success, failure: this.failure }); }
    }; } });
  }, { blank: C.blank() });
  await page.goto('/#sheet');
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toBeVisible();
}
const drafts = page => page.evaluate(() => JSON.parse(localStorage.getItem('sheetflow.pending-drafts.v1') || '{}'));
const count = page => page.evaluate(() => recoveryServer.requests.length);
const finish = (page, index = 0, outcome = 'ok') => page.evaluate(([i, o]) => recoveryServer.finish(i, o), [index, outcome]);
const priority = (page, value, id = 'PRJ-1') => page.locator(`[data-id="${id}"][data-field="priority"]`).selectOption(value);
const recovery = (page, id = 'PRJ-1') => page.locator(`#draft-recovery [data-recovery-key="${id}"]`);

test('failed edit restores exact draft and recovery controls in the editor after reload', async ({ page }) => {
  await cloud(page); await priority(page, 'High'); await finish(page, 0, 'fail');
  const original = (await drafts(page))['PRJ-1'];
  await page.reload();
  await expect(recovery(page)).toContainText('Failed');
  await page.locator('[data-open="PRJ-1"]').click();
  await expect(page.locator('#form-save-status')).toContainText('Failed');
  await expect(page.locator('[name="priority"]')).toHaveValue('High');
  await page.locator('#form-draft-recovery').getByRole('button', { name: 'Copy draft', exact: true }).click();
  const copy = JSON.parse(await page.locator('#form-draft-recovery textarea').inputValue());
  expect(copy).toEqual(original.input);
  await page.locator('#form-draft-recovery').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => count(page)).toBe(1);
  expect(await page.evaluate(() => recoveryServer.requests[0].input)).toEqual(original.input);
  await finish(page); await expect.poll(() => drafts(page)).toEqual({});
  await expect(page.locator('#form-save-status')).toHaveText('Saved');
  await page.locator('#close-dialog').click(); await page.reload();
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toHaveValue('High');
});

test('reloaded pending edit stays unconfirmed and cannot overwrite a newer remote revision', async ({ page }) => {
  await cloud(page); await priority(page, 'High');
  await page.evaluate(() => { recoveryServer.issues[0].priority = 'Highest'; recoveryServer.issues[0].version = 'remote'; recoveryServer.store(); });
  await page.reload();
  await expect(recovery(page)).toContainText('Save unconfirmed');
  await page.locator('[data-open="PRJ-1"]').click();
  await expect(page.locator('#form-save-status')).not.toHaveText('Saved');
  // A fresh edit to the restored draft must still use the original revision.
  await page.locator('[name="priority"]').selectOption('Low'); await expect.poll(() => count(page)).toBe(1);
  expect(await page.evaluate(() => recoveryServer.requests[0].version)).toBe('v1');
  await finish(page);
  await expect(page.locator('#form-save-status')).toContainText('Conflict');
  await page.locator('#close-dialog').click(); await page.reload();
  await expect(recovery(page)).toContainText('Conflict');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Highest'); expect(dialog.message()).toContain('Low'); await dialog.dismiss(); });
  await recovery(page).getByRole('button', { name: 'Compare with latest' }).click();
  expect((await drafts(page))['PRJ-1'].input.priority).toBe('Low');
  expect(await page.evaluate(() => recoveryServer.issues[0].priority)).toBe('Highest');
});

test('another issue saving cannot hide a failed draft or its recovery actions', async ({ page }) => {
  await cloud(page); await priority(page, 'High'); await finish(page, 0, 'fail');
  await priority(page, 'Low', 'PRJ-2'); await finish(page, 1);
  await expect(recovery(page)).toContainText('Failed');
  await expect(recovery(page).getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  await expect(page.locator('#sync-status')).toContainText('Failed');
  await page.reload(); await expect(recovery(page)).toContainText('Failed');
  expect(Object.keys(await drafts(page))).toEqual(['PRJ-1']);
});

test('discard keeps the draft on read failure and restores latest data only after confirmation', async ({ page }) => {
  await cloud(page); await priority(page, 'High'); await finish(page, 0, 'fail');
  const original = await drafts(page);
  await page.evaluate(() => { recoveryServer.failRead = true; });
  await recovery(page).getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.locator('#toast')).toContainText('Read unavailable');
  expect(await drafts(page)).toEqual(original);
  await page.evaluate(() => { recoveryServer.failRead = false; recoveryServer.issues[0].priority = 'Highest'; recoveryServer.issues[0].version = 'remote'; recoveryServer.store(); });
  page.once('dialog', dialog => dialog.dismiss());
  await recovery(page).getByRole('button', { name: 'Discard draft' }).click();
  expect(await drafts(page)).toEqual(original);
  page.once('dialog', dialog => dialog.accept());
  await recovery(page).getByRole('button', { name: 'Discard draft' }).click();
  await expect.poll(() => drafts(page)).toEqual({});
  await expect(page.locator('[data-id="PRJ-1"][data-field="priority"]')).toHaveValue('Highest');
  expect(await count(page)).toBe(1);
});

test('lost acknowledgement reload and retry replays the receipt without a second write', async ({ page }) => {
  await cloud(page); await priority(page, 'High'); await finish(page, 0, 'lost');
  const original = (await drafts(page))['PRJ-1'];
  await page.reload(); await recovery(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => count(page)).toBe(1);
  expect(await page.evaluate(() => recoveryServer.requests[0].input)).toEqual(original.input);
  expect(await page.evaluate(() => recoveryServer.requests[0].version)).toBe(original.version);
  await finish(page); await expect.poll(() => drafts(page)).toEqual({});
  expect(await page.evaluate(() => Object.keys(recoveryServer.receipts).length)).toBe(1);
});

test('failed manual Save exposes recovery without requiring another edit', async ({ page }) => {
  await cloud(page); await page.locator('[data-open="PRJ-1"]').click();
  await page.locator('[name="summary"]').fill('Manual save draft');
  await page.locator('#save-issue').click(); await expect.poll(() => count(page)).toBe(1);
  await finish(page, 0, 'fail');
  await page.locator('#form-draft-recovery').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => count(page)).toBe(2); await finish(page, 1);
  await expect.poll(() => drafts(page)).toEqual({});
  await expect(page.locator('#form-save-status')).toHaveText('Saved');
});

test('local storage write failure is recoverable after reload and saves only locally', async ({ page }) => {
  await page.goto('/#sheet');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'sheetflow.project.v1') throw new Error('Simulated storage failure');
      return setItem.call(this, key, value);
    };
  });
  await priority(page, 'High', 'PRJ-3'); await expect(recovery(page, 'PRJ-3')).toContainText('Failed');
  await page.reload();
  await recovery(page, 'PRJ-3').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => drafts(page)).toEqual({});
  await expect(page.locator('#sync-status')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.locator('[data-id="PRJ-3"][data-field="priority"]')).toHaveValue('High');
});

test('reloaded move draft retries the move endpoint with its original revision and identity', async ({ page }) => {
  await cloud(page);
  await page.evaluate(() => {
    localStorage.setItem('sheetflow.pending-drafts.v1', JSON.stringify({ 'PRJ-1': {
      input: { id: 'PRJ-1', status: 'Review', parentId: '', rank: 3000, operationId: 'move-recovery' },
      version: 'v1', operationId: 'move-recovery', mutation: 'moveIssue', error: 'Response lost'
    } }));
  });
  await page.reload(); await recovery(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => count(page)).toBe(1);
  expect(await page.evaluate(() => ({ mutation: recoveryServer.requests[0].mutation, version: recoveryServer.requests[0].version, operationId: recoveryServer.requests[0].input.operationId }))).toEqual({ mutation: 'moveIssue', version: 'v1', operationId: 'move-recovery' });
  await finish(page); await expect.poll(() => drafts(page)).toEqual({});
  expect(await page.evaluate(() => recoveryServer.issues.find(i => i.id === 'PRJ-1').status)).toBe('Review');
});
