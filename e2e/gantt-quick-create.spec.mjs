import { test, expect } from '@playwright/test';
import C from '../Core.js';

test.use({ viewport: { width: 760, height: 900 } });

const initial = [
  { ...C.blank(), id: 'PRJ-1', type: 'Epic', summary: 'First epic', rank: 1000, version: 'v1' },
  { ...C.blank(), id: 'PRJ-2', type: 'Epic', summary: 'Second epic', rank: 2000, version: 'v2' },
  ...Array.from({ length: 16 }, (_, index) => ({ ...C.blank(), id: `PRJ-${index + 3}`, summary: `Existing task ${index}`, parentId: 'PRJ-1', rank: 3000 + index * 1000, version: `v${index + 3}` }))
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ issues, blank }) => {
    const h = window.ganttCloud = { requests: [], issues, receipts: {}, sequence: 18 };
    window.finishGanttSave = (index, outcome = 'success') => {
      const request = h.requests[index];
      if (outcome === 'fail') { request.failure({ message: 'Temporary save failure' }); return; }
      let saved = h.receipts[request.input.operationId];
      if (!saved) {
        saved = { ...blank, ...request.input, id: `PRJ-${++h.sequence}`, version: `saved-${h.sequence}`, rank: h.sequence * 1000 };
        delete saved._draftKey; delete saved.operationId;
        h.receipts[request.input.operationId] = saved; h.issues.push(saved);
      }
      if (outcome === 'lost') request.failure({ message: 'Save acknowledgement lost' }); else request.success(saved);
    };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(handler) { this.success = handler; return this; },
      withFailureHandler(handler) { this.failure = handler; return this; },
      getProject() { queueMicrotask(() => this.success({ issues: h.issues, comments: {}, settings: [], mode: 'personal', spreadsheetUrl: '' })); },
      saveIssue(input, version) { h.requests.push({ input, version, success: this.success, failure: this.failure }); }
    }; } });
  }, { issues: initial, blank: C.blank() });
  await page.goto('/#gantt');
  await expect(page.locator('.gantt-grid')).toBeVisible();
});

const formFor = page => page.locator('[data-gantt-quick-form]');
const inputFor = page => formFor(page).locator('[name="summary"]');
const pendingFor = page => page.locator('.gantt-row[data-pending-quick]');
const requestCount = page => page.evaluate(() => window.ganttCloud.requests.length);

async function openEpicAdder(page) {
  await page.locator('[data-gantt-add="PRJ-2"]').click();
  await expect(inputFor(page)).toBeFocused();
  await expect(formFor(page).locator('[name="kind"]')).toHaveValue('Story');
}

test('Gantt Story appears before acknowledgement while the form, next title, and scroll stay stable', async ({ page }) => {
  await openEpicAdder(page);
  const input = inputFor(page);
  await page.locator('.gantt-viewport').evaluate(element => { element.scrollLeft = 220; });
  await input.fill('Story saving in the background');
  await input.press('Enter');
  await expect(pendingFor(page)).toHaveCount(1);
  await expect(page.locator('.gantt-swimlane[data-epic-lane="PRJ-2"] [data-pending-quick]')).toContainText('Story saving in the background');
  await expect(pendingFor(page)).toContainText('Saving');
  expect(await pendingFor(page).locator('.gantt-row-label').evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThan(12);
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  expect(await page.locator('.gantt-viewport').evaluate(element => element.scrollLeft)).toBe(220);
  await input.fill('Next unfinished story');
  const before = await input.boundingBox();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.finishGanttSave(0));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(page.locator('[data-gantt-row-id="PRJ-19"]')).toContainText('Story saving in the background');
  await expect(input).toHaveValue('Next unfinished story');
  await expect(input).toBeFocused();
  await expect(formFor(page).locator('[name="kind"]')).toHaveValue('Story');
  expect(Math.abs((await input.boundingBox()).y - before.y)).toBeLessThan(4);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThan(4);
  expect(await page.locator('.gantt-viewport').evaluate(element => element.scrollLeft)).toBe(220);
  const saved = await page.evaluate(() => window.ganttCloud.issues.at(-1));
  expect(saved.type).toBe('Story'); expect(saved.parentId).toBe('PRJ-2');
});

test('Gantt can queue another child with its chosen kind before the previous save finishes', async ({ page }) => {
  await openEpicAdder(page);
  await inputFor(page).fill('First new story'); await inputFor(page).press('Enter');
  await formFor(page).locator('[name="kind"]').selectOption('Task');
  await inputFor(page).fill('Next child task'); await inputFor(page).press('Enter');
  await expect(pendingFor(page)).toHaveCount(2);
  await expect(pendingFor(page).filter({ hasText: 'Next child task' })).toContainText('Queued');
  expect(await requestCount(page)).toBe(1);
  await page.evaluate(() => window.finishGanttSave(0));
  await expect.poll(() => requestCount(page)).toBe(2);
  expect(await page.evaluate(() => window.ganttCloud.requests[0].input.operationId !== window.ganttCloud.requests[1].input.operationId)).toBe(true);
  await expect(page.locator('#sync-status')).toHaveText(/Saving|Queued/);
  await expect(page.locator('#sync-status')).not.toHaveText('Synced with Sheets');
  await page.evaluate(() => window.finishGanttSave(1));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  expect(await page.evaluate(() => window.ganttCloud.issues.slice(-2).map(issue => ({ type: issue.type, parentId: issue.parentId })))).toEqual([
    { type: 'Story', parentId: 'PRJ-2' }, { type: 'Task', parentId: 'PRJ-2' }
  ]);
});

test('adding under a long Epic reveals the pending Story inside the timeline while the page and popup stay put', async ({ page }) => {
  const viewport = page.locator('.gantt-viewport');
  await viewport.scrollIntoViewIfNeeded();
  await viewport.evaluate(element => { element.scrollLeft = 240; element.scrollTop = 0; });
  await page.locator('[data-gantt-add="PRJ-1"]').click();
  const input = inputFor(page), popupBefore = await formFor(page).boundingBox();
  const pageBefore = await page.evaluate(() => window.scrollY);
  await input.fill('Visible below sixteen existing children');
  await input.press('Enter');
  const pending = page.locator('.gantt-swimlane[data-epic-lane="PRJ-1"] .gantt-row[data-pending-quick]');
  await expect(pending).toContainText('Visible below sixteen existing children');
  await expect.poll(() => pending.evaluate(element => {
    const viewport = element.closest('.gantt-viewport'), frame = viewport.getBoundingClientRect();
    const header = viewport.querySelector('.gantt-header').getBoundingClientRect(), row = element.getBoundingClientRect();
    return row.top >= header.bottom - 1 && row.bottom <= frame.bottom + 1;
  })).toBe(true);
  expect(await viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await viewport.evaluate(element => element.scrollLeft)).toBe(240);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - pageBefore)).toBeLessThan(4);
  const popupAfter = await formFor(page).boundingBox();
  expect(Math.abs(popupAfter.x - popupBefore.x)).toBeLessThan(2);
  expect(Math.abs(popupAfter.y - popupBefore.y)).toBeLessThan(2);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill('Continue entering the next story');
  await page.evaluate(() => window.finishGanttSave(0));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(input).toHaveValue('Continue entering the next story');
  await expect(input).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - pageBefore)).toBeLessThan(4);
  expect(await viewport.evaluate(element => element.scrollLeft)).toBe(240);
});

test('adding a Story from a collapsed Epic expands its children and reveals the pending row', async ({ page }) => {
  const toggle = page.locator('.gantt-swimlane[data-epic-lane="PRJ-1"] [data-toggle-lane="PRJ-1"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-gantt-add="PRJ-1"]').click();
  await inputFor(page).fill('Story added to a collapsed Epic'); await inputFor(page).press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.gantt-swimlane[data-epic-lane="PRJ-1"] .gantt-row[data-pending-quick]')).toContainText('Story added to a collapsed Epic');
  await expect(page.locator('[data-gantt-row-id="PRJ-3"]')).toHaveCount(1);
});

test('repeated Enter on the cleared Gantt popup creates only one request', async ({ page }) => {
  await openEpicAdder(page);
  await inputFor(page).fill('Submit a story once');
  await inputFor(page).press('Enter');
  await expect(inputFor(page)).toHaveValue('');
  await inputFor(page).press('Enter');
  await inputFor(page).press('Enter');
  await expect(pendingFor(page)).toHaveCount(1);
  expect(await requestCount(page)).toBe(1);
  await page.evaluate(() => window.finishGanttSave(0));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(page.locator('[data-gantt-row-id="PRJ-19"]')).toContainText('Submit a story once');
  expect(await requestCount(page)).toBe(1);
  expect(await page.evaluate(() => window.ganttCloud.issues.filter(issue => issue.summary === 'Submit a story once').length)).toBe(1);
});

test('Gantt retains a lost acknowledgement and retries the original operation once', async ({ page }) => {
  await openEpicAdder(page);
  await inputFor(page).fill('Story with a lost response'); await inputFor(page).press('Enter');
  await page.evaluate(() => window.finishGanttSave(0, 'lost'));
  await expect(pendingFor(page)).toContainText('Save unconfirmed');
  await expect(pendingFor(page)).toContainText('Save acknowledgement lost');
  await pendingFor(page).getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => requestCount(page)).toBe(2);
  expect(await page.evaluate(() => window.ganttCloud.requests[0].input.operationId === window.ganttCloud.requests[1].input.operationId)).toBe(true);
  await page.evaluate(() => window.finishGanttSave(1));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(page.locator('[data-gantt-row-id="PRJ-19"]')).toContainText('Story with a lost response');
  expect(await page.evaluate(() => window.ganttCloud.issues.filter(issue => issue.summary === 'Story with a lost response').length)).toBe(1);
});

test('an unfinished Gantt Story remains visible and retryable after reload', async ({ page }) => {
  await openEpicAdder(page);
  await inputFor(page).fill('Recover Gantt story'); await inputFor(page).press('Enter');
  await page.reload();
  await expect(pendingFor(page)).toContainText('Recover Gantt story');
  await expect(pendingFor(page)).toContainText('Save unconfirmed');
  await pendingFor(page).getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => requestCount(page)).toBe(1);
  await page.evaluate(() => window.finishGanttSave(0));
  await expect(pendingFor(page)).toHaveCount(0);
  await expect(page.locator('[data-gantt-row-id="PRJ-19"]')).toContainText('Recover Gantt story');
});
