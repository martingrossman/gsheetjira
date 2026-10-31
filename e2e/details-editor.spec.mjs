import { test, expect } from '@playwright/test';
import C from '../Core.js';

const key = 'sheetflow.project.v1';
const initial = [
  { id: 'PRJ-1', type: 'Epic', summary: 'Editor Epic' },
  { id: 'PRJ-2', type: 'Story', summary: 'Parent story', parentId: 'PRJ-1' },
  { id: 'PRJ-3', summary: 'Child task', parentId: 'PRJ-2' },
  { id: 'PRJ-4', summary: 'Dependency task', parentId: 'PRJ-1' }
].map((issue, index) => ({ ...C.blank(), ...issue, rank: (index + 1) * 1000, version: `${issue.id}-v1`, createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z' }));
const discussion = { 'PRJ-2': [{ id: 'COM-1', taskId: 'PRJ-2', body: 'Parent discussion' }], 'PRJ-3': [{ id: 'COM-2', taskId: 'PRJ-3', body: 'Child discussion' }] };
const field = (page, name) => page.locator(`#issue-form [name="${name}"]`);
const open = (page, id) => page.locator(`[data-open="${id}"]`).click();

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`detailed editor groups retain every property and related action at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(({ key, initial, discussion }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ issues: initial, comments: Object.values(discussion).flat(), sequence: 4 }));
    }, { key, initial, discussion });
    await page.goto('/#sheet'); await open(page, 'PRJ-2');
    await expect(page.locator('[data-comment-edit="COM-1"]')).toHaveValue('Parent discussion');
    await expect(page.locator('#editor-primary')).toBeVisible();
    await expect(page.locator('#editor-planning')).toBeVisible();
    await expect(page.locator('#editor-effort > summary')).toHaveText('Effort');
    await expect(page.locator('#editor-metadata > summary')).toHaveText('Metadata');
    const values = {
      summary: 'Updated parent story', description: 'Detailed context', type: 'Story', status: 'Review', priority: 'High',
      parentId: 'PRJ-1', assignee: 'Example assignee', reporter: 'Example reporter', taskTypeId: 'data',
      startDate: '2026-11-01', dueDate: '2026-11-15', sprint: 'Sprint A', labels: 'design, review', dependencies: 'PRJ-4',
      estimate: 5, timeSpent: 1.5, progress: 40
    };
    for (const [name, value] of Object.entries(values)) {
      if (['type', 'status', 'priority', 'parentId', 'taskTypeId'].includes(name)) await field(page, name).selectOption(value);
      else await field(page, name).fill(String(value));
    }
    await page.locator('#editor-effort > summary').click();
    await expect(field(page, 'estimate')).toBeHidden();
    await page.locator('#editor-metadata > summary').click();
    await expect(field(page, 'reporter')).toBeHidden();
    await page.locator('#save-issue').click();
    await expect(page.locator('#issue-dialog')).not.toBeVisible();
    await page.reload(); await open(page, 'PRJ-2');
    for (const [name, value] of Object.entries(values)) await expect(field(page, name)).toHaveValue(String(value));
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).issues, key);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).comments, key)).toEqual(Object.values(discussion).flat());
    expect(saved.find(issue => issue.id === 'PRJ-2')).toMatchObject({ ...values, id: 'PRJ-2', rank: 2000, createdAt: initial[1].createdAt });
    expect(saved.find(issue => issue.id === 'PRJ-3')).toEqual(initial[2]);
    await expect(page.locator('#issue-metadata')).toContainText('Created');
    await expect(page.locator('#delete-issue')).toBeVisible();
    await expect(page.locator('#duplicate-issue')).toBeVisible();
    await expect(page.locator('#duplicate-subtasks-option')).toBeVisible();
    await expect(page.locator('#comments-section')).toContainText('Comments (1)');
    await expect(page.locator('[data-comment-edit="COM-1"]')).toHaveValue('Parent discussion');
    await page.locator('[data-child="PRJ-3"]').click();
    await expect(page.locator('#dialog-id')).toHaveText('PRJ-3');
    await expect(field(page, 'parentId')).toHaveValue('PRJ-2');
    await expect(page.locator('[data-comment-edit="COM-2"]')).toHaveValue('Child discussion');
  });
}

for (const outcome of ['saved', 'failed']) {
  test(`child navigation protects an unsent draft and ignores a late ${outcome} parent response`, async ({ page }) => {
    await page.addInitScript(({ initial, discussion }) => {
      const h = window.detailsCloud = { issues: initial, requests: [] };
      window.finishDetails = (index, fail) => {
        const request = h.requests[index];
        if (fail) { request.failure({ message: 'Temporary save failure' }); return; }
        const current = h.issues.find(issue => issue.id === request.input.id);
        if (current.version !== request.version) { request.failure({ message: 'This issue changed elsewhere.' }); return; }
        const saved = { ...current, ...request.input, version: `saved-${index}`, updatedAt: new Date().toISOString() };
        delete saved.operationId;
        h.issues = h.issues.map(issue => issue.id === saved.id ? saved : issue); request.success(saved);
      };
      window.google = { script: {} };
      Object.defineProperty(window.google.script, 'run', { get() { return {
        withSuccessHandler(handler) { this.success = handler; return this; },
        withFailureHandler(handler) { this.failure = handler; return this; },
        getProject() { queueMicrotask(() => this.success({ issues: structuredClone(h.issues), comments: discussion, settings: [], mode: 'personal', spreadsheetUrl: '' })); },
        saveIssue(input, version) { h.requests.push({ input: structuredClone(input), version, success: this.success, failure: this.failure }); }
      }; } });
    }, { initial, discussion });
    await page.goto('/#sheet'); await open(page, 'PRJ-2');
    page.once('dialog', confirmation => confirmation.dismiss());
    // Edit and navigate in the same turn so the unsent-draft guard is checked
    // before the 700 ms debounce, regardless of the machine's click speed.
    await page.evaluate(() => {
      const description = document.querySelector('#issue-form [name="description"]');
      description.value = 'Parent draft survives switching';
      description.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-child="PRJ-3"]').click();
    });
    await expect(page.locator('#dialog-id')).toHaveText('PRJ-2');
    await expect(field(page, 'description')).toHaveValue('Parent draft survives switching');
    await expect.poll(() => page.evaluate(() => detailsCloud.requests.length)).toBe(1);
    await page.locator('[data-child="PRJ-3"]').click();
    await expect(page.locator('#dialog-id')).toHaveText('PRJ-3');
    await page.evaluate(fail => finishDetails(0, fail), outcome === 'failed');
    await expect(field(page, 'summary')).toHaveValue('Child task');
    await expect(page.locator('[data-comment-edit="COM-2"]')).toHaveValue('Child discussion');
    await page.locator('#close-dialog').click(); await open(page, 'PRJ-2');
    await expect(field(page, 'description')).toHaveValue('Parent draft survives switching');
    if (outcome === 'failed') {
      await expect(page.locator('#form-save-status')).toContainText('Failed');
      await page.locator('#form-draft-recovery').getByRole('button', { name: 'Retry', exact: true }).click();
      await expect.poll(() => page.evaluate(() => detailsCloud.requests.length)).toBe(2);
      await page.evaluate(() => finishDetails(1, false));
    }
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sheetflow.pending-drafts.v1') || '{}'))).toEqual({});
    await expect(field(page, 'description')).toHaveValue('Parent draft survives switching');
  });
}
