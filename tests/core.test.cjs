const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../Core.js');
const day = '2026-10-27', now = day + 'T10:00:00.000Z';
const make = (values = {}) => ({ ...C.blank(), id: 'PRJ-1', summary: 'Example issue', createdAt: now, updatedAt: now, ...values });

test('sample project has unique IDs and valid hierarchy, dates, and dependencies', () => {
  const issues = C.sample(day); assert.equal(new Set(issues.map(i => i.id)).size, issues.length);
  issues.forEach(i => C.validate(i, issues));
});
test('blank projects allow unassigned, unscheduled work', () => assert.doesNotThrow(() => C.validate(make(), [])));
test('calendar arithmetic works across leap days and daylight saving boundaries', () => {
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.validDate('2026-02-29'), false); assert.equal(C.validDate('2026-04-31'), false);
});
test('invalid dates, date ranges, enums, and numeric values are rejected', () => {
  for (const values of [{ summary: '' }, { summary: 'x'.repeat(251) }, { type: 'Other' }, { status: 'Started' }, { priority: 'Urgent' }, { startDate: '2026-02-31' }, { startDate: '2026-10-29', dueDate: day }, { estimate: -1 }, { timeSpent: NaN }, { rank: Infinity }, { progress: 101 }]) assert.throws(() => C.validate(make(values), []));
});
test('Done stamps completion and 100%; reopening clears completion and progress', () => {
  const done = C.prepare({ status: 'Done', progress: 20 }, make(), day, now);
  assert.equal(done.progress, 100); assert.equal(done.completedDate, day);
  const reopened = C.prepare({ status: 'In Progress' }, done, '2026-10-28', now);
  assert.equal(reopened.completedDate, ''); assert.equal(reopened.progress, 0);
});
test('editing completed work preserves its original completion date', () => {
  const result = C.prepare({ summary: 'Changed' }, make({ status: 'Done', completedDate: '2026-10-20' }), day, now);
  assert.equal(result.completedDate, '2026-10-20');
});
test('clients cannot forge IDs or generated timestamps through update payloads', () => {
  const result = C.prepare({ id: 'EVIL-1', createdAt: 'no', updatedAt: 'no', completedDate: '1900-01-01' }, make(), day, now);
  assert.equal(result.id, 'PRJ-1'); assert.equal(result.createdAt, now); assert.equal(result.updatedAt, now); assert.equal(result.completedDate, '');
});
test('only known fields survive preparation from new input', () => {
  const result = C.prepare({ summary: 'New', estimate: '2.5', dependencies: ' PRJ-1,PRJ-1, PRJ-2 ', evil: true }, null, day, now);
  assert.equal(result.estimate, 2.5); assert.equal(result.dependencies, 'PRJ-1, PRJ-2'); assert.equal(result.evil, undefined);
});
test('parent types and existence are enforced', () => {
  const epic = make({ type: 'Epic' }), story = make({ id: 'PRJ-2', type: 'Story', parentId: epic.id });
  assert.doesNotThrow(() => C.validate(story, [epic]));
  assert.throws(() => C.validate(make({ type: 'Epic', parentId: 'PRJ-2' }), [story]));
  assert.throws(() => C.validate(make({ type: 'Story', parentId: 'PRJ-2' }), [story]));
  assert.throws(() => C.validate(make({ parentId: 'PRJ-404' }), []));
  assert.throws(() => C.validate(make({ parentId: 'PRJ-1' }), []));
});
test('changing parent type cannot orphan its children', () => {
  const epic = make({ type: 'Epic' }), story = make({ id: 'PRJ-2', type: 'Story', parentId: epic.id });
  assert.throws(() => C.validate({ ...epic, type: 'Task' }, [epic, story]));
});
test('missing, self-referential and cyclic dependencies are rejected', () => {
  const a = make(), b = make({ id: 'PRJ-2', dependencies: a.id });
  assert.throws(() => C.validate({ ...a, dependencies: a.id }, [a]));
  assert.throws(() => C.validate({ ...a, dependencies: 'PRJ-404' }, [a]));
  assert.throws(() => C.validate({ ...a, dependencies: b.id }, [a, b]));
  const c = make({ id: 'PRJ-3', dependencies: b.id });
  assert.throws(() => C.validate({ ...a, dependencies: c.id }, [a, b, c]));
});
test('linked issues cannot be deleted until their references are removed', () => {
  assert.throws(() => C.canDelete('PRJ-1', [make({ id: 'PRJ-2', parentId: 'PRJ-1' })]));
  assert.throws(() => C.canDelete('PRJ-1', [make({ id: 'PRJ-2', dependencies: 'PRJ-1' })]));
  assert.doesNotThrow(() => C.canDelete('PRJ-1', []));
});
test('CSV escapes multiline quotes and neutralizes spreadsheet formulas', () => {
  const csv = C.csv([make({ summary: '=HYPERLINK("https://example.com")', description: 'one, two\n"three"', assignee: ' +SUM(1,2)' })]);
  assert.ok(csv.startsWith('\uFEFF"ID"')); assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('"one, two\n""three"""')); assert.ok(csv.includes('"\' +SUM(1,2)"'));
});
