import { test, expect } from '@playwright/test';
import C from '../Core.js';

const projectKey = 'sheetflow.project.v1';
const initialIssues = [
  { ...C.blank(), id: 'PRJ-1', type: 'Story', summary: 'Original story', status: 'In Progress', version: 'story-v1', rank: 1000 },
  { ...C.blank(), id: 'PRJ-2', parentId: 'PRJ-1', summary: 'Original child', status: 'Done', progress: 100, timeSpent: 4, version: 'child-v1', rank: 2000 }
];
const readProject = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), projectKey);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, issues }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ issues, comments: [], sequence: 2 }));
  }, { key: projectKey, issues: initialIssues });
  await page.goto('/');
  await expect(page.locator('[data-issue="PRJ-1"]')).toBeVisible();
});

async function duplicate(page, descendants = true) {
  await page.locator('[data-issue="PRJ-1"]').click();
  await page.locator('#duplicate-subtasks').setChecked(descendants);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('#dialog-id')).not.toHaveText('PRJ-1');
  const copyId = await page.locator('#dialog-id').textContent();
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  return copyId;
}

for (const descendants of [false, true]) test(`Edge duplicates and undoes ${descendants ? 'a tree' : 'one issue'} across reload`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  expect(await page.evaluate(() => navigator.userAgent)).toContain('Edg/');
  await duplicate(page, descendants);
  const copied = (await readProject(page)).issues.filter(issue => !['PRJ-1', 'PRJ-2'].includes(issue.id));
  expect(copied).toHaveLength(descendants ? 2 : 1);
  expect(copied.every(issue => issue.status === 'Backlog' && issue.progress === 0 && issue.timeSpent === 0)).toBe(true);
  if (descendants) expect(copied[1].parentId).toBe(copied[0].id);
  await page.reload();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Duplication undone');
  expect((await readProject(page)).issues).toEqual(initialIssues);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

for (const laterWork of ['edit', 'child', 'dependency', 'comment']) test(`duplicate undo protects a later ${laterWork}`, async ({ page }) => {
  const copyId = await duplicate(page);
  await page.evaluate(({ key, id, laterWork, blank }) => {
    const db = JSON.parse(localStorage.getItem(key));
    if (laterWork === 'edit') Object.assign(db.issues.find(issue => issue.id === id), { summary: 'Later edit', version: 'later-version' });
    else if (laterWork === 'comment') db.comments.push({ id: 'COM-1', taskId: id, body: 'Later discussion' });
    else db.issues.push({ ...blank, id: 'PRJ-5', summary: 'Later linked issue', version: 'linked-v1', [laterWork === 'child' ? 'parentId' : 'dependencies']: id });
    localStorage.setItem(key, JSON.stringify(db));
  }, { key: projectKey, id: copyId, laterWork, blank: C.blank() });
  await page.reload();
  const before = await readProject(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Could not undo duplication');
  expect(await readProject(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('duplicate undo retries after a lost acknowledgement and reload', async ({ page }) => {
  await duplicate(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      original.call(this, name, value);
      if (name === key && Object.keys(JSON.parse(value).duplicateUndoReceipts || {}).length) {
        Storage.prototype.setItem = original;
        throw new Error('Simulated lost acknowledgement');
      }
    };
  }, projectKey);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Simulated lost acknowledgement');
  expect((await readProject(page)).issues).toEqual(initialIssues);
  await page.reload();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Duplication undone');
  expect(Object.keys((await readProject(page)).duplicateUndoReceipts)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
