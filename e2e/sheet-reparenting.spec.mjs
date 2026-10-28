import { test, expect } from '@playwright/test';
import C from '../Core.js';

const projectKey = 'sheetflow.project.v1';
const initial = [
  { id: 'PRJ-1', type: 'Epic', summary: 'First epic', status: 'In Progress' },
  { id: 'PRJ-2', type: 'Story', parentId: 'PRJ-1', summary: 'Alpha story', status: 'In Progress' },
  { id: 'PRJ-3', parentId: 'PRJ-2', summary: 'Alpha task', status: 'Done', progress: 100, completedDate: '2026-10-27', startDate: '2026-10-20', dueDate: '2026-10-27', assignee: 'Martin', labels: 'keep', dependencies: 'PRJ-4', taskTypeId: 'data' },
  { id: 'PRJ-4', parentId: 'PRJ-2', summary: 'Zebra task', status: 'Backlog', startDate: '2026-11-01', dueDate: '2026-11-03' },
  { id: 'PRJ-5', type: 'Story', parentId: 'PRJ-1', summary: 'Zebra story', status: 'To Do' },
  { id: 'PRJ-6', parentId: 'PRJ-5', summary: 'Another child', status: 'Review' },
  { id: 'PRJ-7', type: 'Epic', summary: 'Second epic', status: 'Backlog' },
  { id: 'PRJ-8', type: 'Story', parentId: 'PRJ-7', summary: 'Second epic story', status: 'To Do' },
  { id: 'PRJ-9', parentId: 'PRJ-8', summary: 'Destination task', status: 'In Progress' },
  { id: 'PRJ-10', parentId: 'PRJ-3', summary: 'Nested task', status: 'Review' }
].map((issue, index) => ({ ...C.blank(), ...issue, rank: (index + 1) * 1000, createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z', version: `${issue.id}-v1` }));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, issues }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ issues, comments: [], sequence: 10 }));
  }, { key: projectKey, issues: initial });
  await page.goto('/#sheet');
  await expect(page.locator('[data-sheet-row-id="PRJ-2"]')).toBeVisible();
});

const row = (page, id) => page.locator(`[data-sheet-row-id="${id}"]`);
const grip = (page, id) => page.locator(`[data-sheet-drag-id="${id}"]`);
const readIssues = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).issues, projectKey);
const rawProject = page => page.evaluate(key => localStorage.getItem(key), projectKey);
const original = id => initial.find(issue => issue.id === id);
const businessValues = ({ parentId, rank, updatedAt, version, ...issue }) => issue;

async function dropOnRow(page, sourceId, targetId, edge = 'center') {
  const target = row(page, targetId);
  const box = await target.boundingBox();
  await grip(page, sourceId).dragTo(target, { targetPosition: { x: 80, y: edge === 'before' ? 2 : edge === 'after' ? box.height - 2 : box.height / 2 } });
}

async function openAfterDrop(page, id) {
  await expect(async () => {
    if (!(await page.locator('#issue-dialog').isVisible())) await row(page, id).locator(`[data-open="${id}"]`).click();
    await expect(page.locator('#issue-dialog')).toBeVisible({ timeout: 100 });
    await expect(page.locator('#dialog-id')).toHaveText(id, { timeout: 100 });
  }).toPass({ timeout: 4000, intervals: [100, 250, 500] });
}

async function syntheticDrop(page, sourceId, target, className) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await grip(page, sourceId).dispatchEvent('dragstart', { dataTransfer: transfer });
  await expect(target).toBeVisible();
  const box = await target.boundingBox(), position = { clientX: box.x + 80, clientY: box.y + box.height / 2 };
  await target.dispatchEvent('dragover', { dataTransfer: transfer, ...position });
  if (className) await expect(target).toHaveClass(className);
  await target.dispatchEvent('drop', { dataTransfer: transfer, ...position });
  await page.locator('#view-content').dispatchEvent('dragend', { dataTransfer: transfer });
  await transfer.dispose();
}

test('a Task can move to another Story while retaining dates, status, nested children, reload and undo', async ({ page }) => {
  await dropOnRow(page, 'PRJ-3', 'PRJ-8');
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-8');
  const saved = await readIssues(page), task = saved.find(issue => issue.id === 'PRJ-3');
  expect(businessValues(task)).toEqual(businessValues(original('PRJ-3')));
  expect(saved.find(issue => issue.id === 'PRJ-10')).toEqual(original('PRJ-10'));
  await openAfterDrop(page, 'PRJ-10');
  await expect(page.locator('#issue-form [name="parentId"]')).toHaveValue('PRJ-3');
  await expect(page.locator('#issue-form [name="parentId"] option[value="PRJ-10"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await page.reload();
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-8');
  await expect(row(page, 'PRJ-10')).toHaveAttribute('data-sheet-parent', 'PRJ-3');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-2');
  const restored = (await readIssues(page)).find(issue => issue.id === 'PRJ-3');
  expect({ ...restored, version: original('PRJ-3').version, updatedAt: original('PRJ-3').updatedAt }).toEqual(original('PRJ-3'));
});

test('dropping on a collapsed Epic expands the destination and reveals its moved Story', async ({ page }) => {
  const header = page.locator('[data-sheet-parent-target="PRJ-7"]');
  await header.locator('[data-toggle-lane="PRJ-7"]').click();
  await expect(row(page, 'PRJ-8')).toBeHidden();
  await grip(page, 'PRJ-2').dragTo(header);
  await expect(header.locator('[data-toggle-lane="PRJ-7"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'PRJ-2')).toHaveAttribute('data-sheet-parent', 'PRJ-7');
  await expect(row(page, 'PRJ-3')).toBeVisible();
  await expect(row(page, 'PRJ-10')).toBeVisible();
  await expect(row(page, 'PRJ-8')).toBeVisible();
});

test('dropping a Story on another Epic header moves its complete subtree into that lane', async ({ page }) => {
  await grip(page, 'PRJ-2').dragTo(page.locator('[data-sheet-parent-target="PRJ-7"]'));
  await expect(row(page, 'PRJ-2')).toHaveAttribute('data-sheet-parent', 'PRJ-7');
  const lane = page.locator('[data-sheet-parent-target="PRJ-7"]').locator('xpath=ancestor::tbody');
  for (const id of ['PRJ-2', 'PRJ-3', 'PRJ-4', 'PRJ-10']) await expect(lane.locator(`[data-sheet-row-id="${id}"]`)).toBeVisible();
  const saved = await readIssues(page);
  expect(businessValues(saved.find(issue => issue.id === 'PRJ-2'))).toEqual(businessValues(original('PRJ-2')));
  for (const id of ['PRJ-3', 'PRJ-4', 'PRJ-10']) expect(saved.find(issue => issue.id === id)).toEqual(original(id));
  await page.reload();
  await expect(row(page, 'PRJ-2')).toHaveAttribute('data-sheet-parent', 'PRJ-7');
});

test('invalid Story parents and descendant cycles are rejected before any project write', async ({ page }) => {
  const before = await rawProject(page);
  await syntheticDrop(page, 'PRJ-2', row(page, 'PRJ-3'), /sheet-drop-invalid/);
  expect(await rawProject(page)).toBe(before);
  await syntheticDrop(page, 'PRJ-3', row(page, 'PRJ-10'), /sheet-drop-invalid/);
  expect(await rawProject(page)).toBe(before);
  await expect(row(page, 'PRJ-2')).toHaveAttribute('data-sheet-parent', 'PRJ-1');
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-2');
});

test('cross-parent edge insertion under sorting preserves filtered hidden siblings', async ({ page }) => {
  const hidden = [
    { ...C.blank(), id: 'PRJ-11', summary: 'Hidden before', parentId: 'PRJ-8', rank: 8500, version: 'hidden-before' },
    { ...C.blank(), id: 'PRJ-12', summary: 'Hidden after', parentId: 'PRJ-8', rank: 9500, version: 'hidden-after' }
  ];
  await page.evaluate(({ key, hidden }) => { const db = JSON.parse(localStorage.getItem(key)); db.issues.push(...hidden); db.sequence = 12; localStorage.setItem(key, JSON.stringify(db)); }, { key: projectKey, hidden });
  await page.reload();
  await page.locator('[data-sort="summary"]').click();
  await page.getByRole('searchbox', { name: 'Search issues', exact: true }).fill('task');
  await expect(page.locator('[data-sheet-manual]')).toHaveAttribute('aria-pressed', 'false');
  await dropOnRow(page, 'PRJ-4', 'PRJ-9', 'before');
  await expect(row(page, 'PRJ-4')).toHaveAttribute('data-sheet-parent', 'PRJ-8');
  await expect(page.locator('[data-sheet-manual]')).toHaveAttribute('aria-pressed', 'true');
  const saved = await readIssues(page), moved = saved.find(issue => issue.id === 'PRJ-4');
  expect(moved.rank).toBeGreaterThan(8500); expect(moved.rank).toBeLessThan(9000);
  expect(businessValues(moved)).toEqual(businessValues(original('PRJ-4')));
  expect(saved.filter(issue => ['PRJ-11', 'PRJ-12'].includes(issue.id))).toEqual(hidden);
  await page.getByRole('searchbox', { name: 'Search issues', exact: true }).fill('');
  await expect.poll(() => page.locator('.sheet-issue-row[data-sheet-parent="PRJ-8"]').evaluateAll(rows => rows.map(element => element.dataset.sheetRowId))).toEqual(['PRJ-11', 'PRJ-4', 'PRJ-9', 'PRJ-12']);
});

test('the explicit Sheet drop target unparents a Task while preserving its subtree and business fields', async ({ page }) => {
  await syntheticDrop(page, 'PRJ-3', page.locator('#sheet-unparent-drop'), /sheet-drop-unparent/);
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', '');
  await expect(row(page, 'PRJ-10')).toHaveAttribute('data-sheet-parent', 'PRJ-3');
  const saved = await readIssues(page);
  expect(businessValues(saved.find(issue => issue.id === 'PRJ-3'))).toEqual(businessValues(original('PRJ-3')));
  expect(saved.find(issue => issue.id === 'PRJ-10')).toEqual(original('PRJ-10'));
  await expect(page.locator('#sheet-unparent-drop')).toBeHidden();
});

test('flat Sheet rows can nest a Task under another Task and the editor retains its valid parent', async ({ page }) => {
  await page.locator('#swimlanes-toggle').uncheck();
  await expect(row(page, 'PRJ-1')).toBeVisible();
  await dropOnRow(page, 'PRJ-3', 'PRJ-6');
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-6');
  await expect(row(page, 'PRJ-10')).toHaveAttribute('data-sheet-parent', 'PRJ-3');
  await openAfterDrop(page, 'PRJ-3');
  const parent = page.locator('#issue-form [name="parentId"]');
  await expect(parent).toHaveValue('PRJ-6');
  await expect(parent.locator('option[value="PRJ-10"]')).toHaveCount(0);
  await expect(parent.locator('option[value="PRJ-3"]')).toHaveCount(0);
  await page.locator('#issue-form [name="summary"]').fill('Nested task remains nested');
  await expect.poll(async () => (await readIssues(page)).find(issue => issue.id === 'PRJ-3').summary).toBe('Nested task remains nested');
  await expect(page.locator('#form-save-status')).toHaveText('Saved');
  expect((await readIssues(page)).find(issue => issue.id === 'PRJ-3').parentId).toBe('PRJ-6');
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await page.reload();
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-6');
});

test('two rapid parent drops use distinct operations and the second waits for the first saved revision', async ({ page }) => {
  await page.addInitScript(({ issues }) => {
    const state = window.sheetMoveCloud = { issues, requests: [] };
    window.finishSheetMove = index => {
      const request = state.requests[index], current = state.issues.find(issue => issue.id === request.id);
      if (current.version !== request.expectedVersion) { request.failure({ message: 'This issue changed elsewhere.' }); return; }
      const saved = { ...current, ...request.move, version: `move-${index + 1}`, updatedAt: new Date().toISOString() };
      delete saved.operationId;
      state.issues = state.issues.map(issue => issue.id === request.id ? saved : issue);
      request.success(saved);
    };
    window.google = { script: {} };
    Object.defineProperty(window.google.script, 'run', { get() { return {
      withSuccessHandler(handler) { this.success = handler; return this; },
      withFailureHandler(handler) { this.failure = handler; return this; },
      getProject() { queueMicrotask(() => this.success({ issues: state.issues, comments: {}, settings: [], mode: 'personal', spreadsheetUrl: '' })); },
      moveIssue(id, move, expectedVersion, operationId) { state.requests.push({ id, move, expectedVersion, operationId, success: this.success, failure: this.failure }); }
    }; } });
  }, { issues: initial });
  await page.reload();
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-2');
  await dropOnRow(page, 'PRJ-3', 'PRJ-8');
  await expect.poll(() => page.evaluate(() => sheetMoveCloud.requests.length)).toBe(1);
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-8');
  await dropOnRow(page, 'PRJ-3', 'PRJ-5');
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-5');
  expect(await page.evaluate(() => sheetMoveCloud.requests.length)).toBe(1);
  await page.evaluate(() => finishSheetMove(0));
  await expect.poll(() => page.evaluate(() => sheetMoveCloud.requests.length)).toBe(2);
  const requests = await page.evaluate(() => sheetMoveCloud.requests.map(({ id, move, expectedVersion, operationId }) => ({ id, move, expectedVersion, operationId })));
  expect(requests[0].move.parentId).toBe('PRJ-8'); expect(requests[1].move.parentId).toBe('PRJ-5');
  expect(requests[0].operationId).not.toBe(requests[1].operationId);
  expect(requests[1].expectedVersion).toBe('move-1');
  await expect(page.locator('#sync-status')).toHaveText(/Saving/);
  await page.evaluate(() => finishSheetMove(1));
  await expect(page.locator('#sync-status')).toHaveText('Synced with Sheets');
  await expect(row(page, 'PRJ-3')).toHaveAttribute('data-sheet-parent', 'PRJ-5');
  const saved = await page.evaluate(() => sheetMoveCloud.issues);
  expect(businessValues(saved.find(issue => issue.id === 'PRJ-3'))).toEqual(businessValues(original('PRJ-3')));
  expect(saved.find(issue => issue.id === 'PRJ-10')).toEqual(original('PRJ-10'));
});
