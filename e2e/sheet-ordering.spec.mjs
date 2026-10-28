import { test, expect } from '@playwright/test';
import C from '../Core.js';

const key = 'sheetflow.project.v1';
const issues = [
  { id: 'PRJ-1', type: 'Epic', summary: 'Epic', status: 'In Progress' },
  { id: 'PRJ-2', type: 'Story', parentId: 'PRJ-1', summary: 'Alpha story', status: 'In Progress' },
  { id: 'PRJ-3', parentId: 'PRJ-2', summary: 'Alpha task', status: 'Done' },
  { id: 'PRJ-4', parentId: 'PRJ-2', summary: 'Zebra task', status: 'Backlog' },
  { id: 'PRJ-5', type: 'Story', parentId: 'PRJ-1', summary: 'Zebra story', status: 'To Do' },
  { id: 'PRJ-6', parentId: 'PRJ-5', summary: 'Another child', status: 'Review' }
].map((issue, index) => ({ ...C.blank(), ...issue, rank: (index + 1) * 1000, version: `${issue.id}-v1` }));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, issues }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ issues, comments: [], sequence: 6 }));
  }, { key, issues });
  await page.goto('/#sheet');
  await expect(page.locator('[data-sheet-row-id="PRJ-2"]')).toBeVisible();
});

const visibleOrder = page => page.locator('.sheet-issue-row').evaluateAll(rows => rows.map(row => row.dataset.sheetRowId));
const readIssues = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).issues, key);
const move = (page, id, direction) => page.locator(`[data-sheet-move-id="${id}"][data-sheet-move="${direction}"]`);

test('stories reorder across statuses with children attached, reload persistence, and undo', async ({ page }) => {
  await expect(move(page, 'PRJ-5', 'up')).toBeEnabled();
  await move(page, 'PRJ-5', 'up').click();
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-5', 'PRJ-6', 'PRJ-2', 'PRJ-3', 'PRJ-4']);
  const saved = await readIssues(page);
  expect(saved.map(({ rank, version, updatedAt, ...issue }) => issue)).toEqual(issues.map(({ rank, version, updatedAt, ...issue }) => issue));
  await page.reload();
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-5', 'PRJ-6', 'PRJ-2', 'PRJ-3', 'PRJ-4']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-2', 'PRJ-3', 'PRJ-4', 'PRJ-5', 'PRJ-6']);
});

test('tasks reorder across statuses with the keyboard', async ({ page }) => {
  await page.locator('[data-sheet-drag-id="PRJ-4"]').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-2', 'PRJ-4', 'PRJ-3', 'PRJ-5', 'PRJ-6']);
  await expect(page.locator('[data-sheet-drag-id="PRJ-4"]')).toBeFocused();
});

test('move buttons work after column sorting and switch to manual order', async ({ page }) => {
  await page.locator('[data-sort="summary"]').click();
  await expect(page.locator('[data-sheet-manual]')).toHaveAttribute('aria-pressed', 'false');
  await expect(move(page, 'PRJ-4', 'up')).toBeEnabled();
  await move(page, 'PRJ-4', 'up').click();
  await expect(page.locator('[data-sheet-manual]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-2', 'PRJ-4', 'PRJ-3', 'PRJ-5', 'PRJ-6']);
});

test('dragging works after column sorting and across sibling statuses', async ({ page }) => {
  await page.locator('[data-sort="summary"]').click();
  const grip = page.locator('[data-sheet-drag-id="PRJ-4"]');
  await expect(grip).toHaveAttribute('draggable', 'true');
  await grip.dragTo(page.locator('[data-sheet-row-id="PRJ-3"]'), { targetPosition: { x: 80, y: 2 } });
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-2', 'PRJ-4', 'PRJ-3', 'PRJ-5', 'PRJ-6']);
  await expect(page.locator('[data-sheet-manual]')).toHaveAttribute('aria-pressed', 'true');
  const task = (await readIssues(page)).find(issue => issue.id === 'PRJ-4');
  expect(task.parentId).toBe('PRJ-2'); expect(task.status).toBe('Backlog');
});

test('filtered reordering preserves hidden siblings and their relative order', async ({ page }) => {
  const hidden = [7, 8].map((n, index) => ({ ...C.blank(), id: `PRJ-${n}`, parentId: 'PRJ-2', summary: `Hidden ${n}`, rank: 3300 + index * 100, version: `hidden-${n}` }));
  await page.evaluate(({ key, hidden }) => {
    const db = JSON.parse(localStorage.getItem(key)); db.issues.push(...hidden);
    localStorage.setItem(key, JSON.stringify(db));
  }, { key, hidden });
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search issues', exact: true }).fill('task');
  await move(page, 'PRJ-4', 'up').click();
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-4', 'PRJ-3']);
  expect((await readIssues(page)).filter(issue => ['PRJ-7', 'PRJ-8'].includes(issue.id))).toEqual(hidden);
  await page.getByRole('searchbox', { name: 'Search issues', exact: true }).fill('');
  await expect.poll(() => visibleOrder(page)).toEqual(['PRJ-2', 'PRJ-4', 'PRJ-3', 'PRJ-7', 'PRJ-8', 'PRJ-5', 'PRJ-6']);
});
