const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const C = require('../Core.js');
function harness() {
  const rows = [C.fields.map(f => f.label)];
  const notes = new Map();
  const props = new Map([['SPREADSHEET_ID', 'book-1']]);
  let locks = 0, releases = 0;
  function range(row, column, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[column - 1 + c] ?? '')),
      setValues: values => { values.forEach((line, r) => line.forEach((value, c) => { if (!rows[row - 1 + r]) rows[row - 1 + r] = Array(C.fields.length).fill(''); rows[row - 1 + r][column - 1 + c] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value; })); },
      setValue: value => range(row, column).setValues([[value]]),
      getRow: () => row, getLastRow: () => row + height - 1, getColumn: () => column, getLastColumn: () => column + width - 1,
      getNumRows: () => height, getNumColumns: () => width,
      setNote: value => { notes.set(`${row}:${column}`, value); return range(row, column); }, getNote: () => notes.get(`${row}:${column}`) || '',
      getSheet: () => sheet
    };
  }
  const sheet = { getLastRow: () => rows.length, getMaxRows: () => 1000, getRange: range, getName: () => 'Issues', getParent: () => book, deleteRow: row => rows.splice(row - 1, 1) };
  const book = { getSheetByName: () => sheet, getId: () => 'book-1', getUrl: () => 'https://docs.google.com/spreadsheets/d/book-1/edit', getName: () => 'Project', getSpreadsheetTimeZone: () => 'Europe/Prague' };
  const context = vm.createContext({ Date, console, TrackerCore: C,
    SpreadsheetApp: { openById: () => book, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => locks++, releaseLock: () => releases++ }) },
    Utilities: {
      formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? date.toLocaleDateString('en-CA', { timeZone: zone }) : date.toISOString(),
      parseDate: date => new Date(date + 'T00:00:00.000Z'),
      DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, value) => crypto.createHash('sha256').update(value).digest(), base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Code.js'), 'utf8'), context);
  return { api: context, rows, notes, props, sheet, book, balanced: () => locks === releases };
}
test('server creates, updates, serializes dates, and deletes issues', () => {
  const h = harness();
  const issue = h.api.saveIssue({ summary: 'First', startDate: '2026-10-27', dueDate: '2026-11-02' });
  assert.equal(issue.id, 'PRJ-1'); assert.equal(issue.startDate, '2026-10-27'); assert.ok(issue.version);
  assert.ok(h.rows[1][9] instanceof Date);
  const done = h.api.saveIssue({ id: issue.id, status: 'Done' }, issue.version);
  assert.equal(done.progress, 100); assert.ok(done.completedDate); assert.notEqual(done.version, issue.version);
  assert.doesNotThrow(() => JSON.stringify(h.api.getProject()));
  h.api.deleteIssue(done.id, done.version); assert.equal(h.api.getProject().issues.length, 0); assert.ok(h.balanced());
});
test('stale browser versions cannot overwrite or delete newer changes', () => {
  const h = harness(), issue = h.api.saveIssue({ summary: 'Original' });
  h.api.saveIssue({ id: issue.id, summary: 'Newer' }, issue.version);
  assert.throws(() => h.api.saveIssue({ id: issue.id, summary: 'Stale' }, issue.version), /changed elsewhere/);
  assert.throws(() => h.api.deleteIssue(issue.id, issue.version), /changed elsewhere/);
  assert.equal(h.api.getProject().issues[0].summary, 'Newer'); assert.ok(h.balanced());
});
test('move command validates and applies status, parent, and rank together', () => {
  const h = harness(), epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' }), task = h.api.saveIssue({ summary: 'Task' });
  const moved = h.api.moveIssue(task.id, { status: 'In Progress', parentId: epic.id, rank: 2500, operationId: 'move-1' }, task.version, 'move-1');
  assert.equal(moved.status, 'In Progress'); assert.equal(moved.parentId, epic.id); assert.equal(moved.rank, 2500);
  assert.throws(() => h.api.moveIssue(task.id, { parentId: 'MISSING' }, task.version), /changed elsewhere/);
  assert.throws(() => h.api.moveIssue(task.id, { parentId: task.id }, moved.version), /existing parent/);
  assert.ok(h.balanced());
});
test('Sheets quick add creates parent-aware work using safe defaults', () => {
  const h = harness(), epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' });
  const story = h.api.quickCreateIssue('Quick story', 'Story', epic.id, 'quick-1');
  assert.equal(story.type, 'Story'); assert.equal(story.parentId, epic.id); assert.equal(story.status, 'Backlog'); assert.equal(story.taskTypeId, 'algo');
});
test('batch creation previews per-item failures and retries accepted items without duplicates', () => {
  const h = harness(), receipts = new Map();
  h.api.SheetFlowHistory = {
    findReceipt: (_, operationId) => receipts.has(operationId) ? { result: receipts.get(operationId) } : null,
    record: () => {}, receipt: (_, operationId, result) => receipts.set(operationId, result)
  };
  const items = [
    { operationId: 'bulk-1', input: { summary: 'First batch task', status: 'Backlog' } },
    { operationId: 'bulk-2', input: { summary: '', status: 'Backlog' } },
    { operationId: 'bulk-3', input: { summary: 'Third batch task', status: 'Backlog' } }
  ];
  const first = h.api.createIssuesBatch(items);
  assert.deepEqual(Array.from(first.items, row => row.issue.id), ['PRJ-1', 'PRJ-3']);
  assert.deepEqual(Array.from(first.errors, row => row.index), [1]);
  const retry = h.api.createIssuesBatch(items);
  assert.deepEqual(Array.from(retry.items, row => row.issue.id), ['PRJ-1', 'PRJ-3']);
  assert.deepEqual(Array.from(retry.errors, row => row.index), [1]);
  assert.equal(h.rows.length, 3); assert.ok(h.balanced());
});
test('bulk updates validate the full bounded batch, save revisions, and replay idempotently', () => {
  const h = harness(), receipts = new Map(), historyEvents = [];
  h.api.SheetFlowHistory = {
    findReceipt: (_, operationId) => operationId && receipts.has(operationId) ? { result: receipts.get(operationId) } : null,
    record: (_, event) => historyEvents.push(event), receipt: (_, operationId, result) => { if (operationId) receipts.set(operationId, result); }
  };
  const first = h.api.saveIssue({ summary: 'First' }), second = h.api.saveIssue({ summary: 'Second' });
  const items = [
    { id: first.id, expectedVersion: first.version, operationId: 'edit-1', updates: { status: 'In Progress' } },
    { id: second.id, expectedVersion: second.version, operationId: 'edit-2', updates: { priority: 'Highest' } }
  ];
  const result = h.api.updateIssuesBatch(items);
  assert.deepEqual(Array.from(result.items, row => row.issue.id), ['PRJ-1', 'PRJ-2']);
  assert.equal(result.items[0].issue.status, 'In Progress'); assert.equal(result.items[1].issue.priority, 'Highest');
  assert.equal(historyEvents.filter(event => event.details?.bulk).length, 2); assert.equal(receipts.size, 2);
  const retry = h.api.updateIssuesBatch(items);
  assert.equal(retry.replayed, true); assert.deepEqual(Array.from(retry.items, row => row.issue.version), Array.from(result.items, row => row.issue.version));
  assert.equal(h.api.getProject().issues.length, 2); assert.ok(h.balanced());
});
test('invalid or stale bulk updates reject every record before any write', () => {
  const h = harness(), first = h.api.saveIssue({ summary: 'First' }), second = h.api.saveIssue({ summary: 'Second' });
  const invalid = h.api.updateIssuesBatch([
    { id: first.id, expectedVersion: first.version, operationId: 'bad-1', updates: { priority: 'Highest' } },
    { id: second.id, expectedVersion: second.version, operationId: 'bad-2', updates: { status: 'Not a status' } }
  ]);
  assert.equal(invalid.rejected, true); assert.equal(invalid.items.length, 0); assert.deepEqual(Array.from(invalid.errors, error => error.id), [second.id]);
  assert.equal(h.api.getProject().issues.find(issue => issue.id === first.id).priority, 'Medium');
  h.api.saveIssue({ id: second.id, status: 'In Progress' }, second.version);
  const stale = h.api.updateIssuesBatch([
    { id: first.id, expectedVersion: first.version, operationId: 'stale-1', updates: { priority: 'High' } },
    { id: second.id, expectedVersion: second.version, operationId: 'stale-2', updates: { status: 'Review' } }
  ]);
  assert.equal(stale.rejected, true); assert.equal(stale.items.length, 0); assert.equal(h.api.getProject().issues.find(issue => issue.id === first.id).priority, 'Medium');
  assert.equal(h.api.getProject().issues.find(issue => issue.id === second.id).status, 'In Progress');
  assert.ok(h.balanced());
});
test('bulk update undo can restore the progress behind a completed status', () => {
  const h = harness(), receipts = new Map(), issue = h.api.saveIssue({ summary: 'Partially done', progress: 73 });
  h.api.SheetFlowHistory = {
    findReceipt: (_, operationId) => operationId && receipts.has(operationId) ? { result: receipts.get(operationId) } : null,
    record: () => {}, receipt: (_, operationId, result) => { if (operationId) receipts.set(operationId, result); }
  };
  const completed = h.api.updateIssuesBatch([{ id: issue.id, expectedVersion: issue.version, operationId: 'complete-1', updates: { status: 'Done' } }]).items[0].issue;
  assert.equal(completed.progress, 100);
  const restored = h.api.updateIssuesBatch([{ id: issue.id, expectedVersion: completed.version, operationId: 'undo-complete-1', updates: { status: 'Backlog' }, restoreProgress: 73 }]).items[0].issue;
  assert.equal(restored.status, 'Backlog'); assert.equal(restored.progress, 73);
});
test('a storage failure during bulk save restores already-written issue rows', () => {
  const h = harness(), first = h.api.saveIssue({ summary: 'First' }), second = h.api.saveIssue({ summary: 'Second' });
  const originalGetRange = h.sheet.getRange.bind(h.sheet); let failSecondRowOnce = true;
  h.sheet.getRange = (row, column, height, width) => {
    const range = originalGetRange(row, column, height, width);
    if (row === 3 && column === 1 && failSecondRowOnce) return { ...range, setValues: () => { failSecondRowOnce = false; throw new Error('simulated storage failure'); } };
    return range;
  };
  assert.throws(() => h.api.updateIssuesBatch([
    { id: first.id, expectedVersion: first.version, operationId: 'write-fail-1', updates: { priority: 'High' } },
    { id: second.id, expectedVersion: second.version, operationId: 'write-fail-2', updates: { priority: 'High' } }
  ]), /All written rows were restored/);
  assert.equal(h.api.getProject().issues.find(issue => issue.id === first.id).priority, 'Medium');
  assert.equal(h.api.getProject().issues.find(issue => issue.id === second.id).priority, 'Medium');
  assert.ok(h.balanced());
});
test('issue duplication resets workflow data, remaps descendants, and retries without duplicates', () => {
  const h = harness(), receipts = new Map(), historyEvents = [];
  h.api.SheetFlowHistory = {
    findReceipt: (_, operationId) => operationId && receipts.has(operationId) ? { result: receipts.get(operationId) } : null,
    record: (_, event) => historyEvents.push(event), receipt: (_, operationId, result) => { if (operationId) receipts.set(operationId, result); }
  };
  const epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' });
  const story = h.api.saveIssue({ summary: 'Story', type: 'Story', parentId: epic.id, status: 'In Progress', estimate: 8 });
  const task = h.api.saveIssue({ summary: 'Completed child', parentId: story.id, status: 'Done', progress: 100, timeSpent: 5 });
  const result = h.api.duplicateIssue(story.id, story.version, true, 'duplicate-1');
  assert.equal(result.items.length, 2);
  const copiedStory = result.items[0].issue, copiedTask = result.items[1].issue;
  assert.equal(copiedStory.type, 'Story'); assert.equal(copiedStory.parentId, epic.id); assert.equal(copiedStory.status, 'Backlog'); assert.equal(copiedStory.estimate, 8);
  assert.equal(copiedTask.parentId, copiedStory.id); assert.equal(copiedTask.status, 'Backlog'); assert.equal(copiedTask.progress, 0); assert.equal(copiedTask.timeSpent, 0); assert.equal(copiedTask.completedDate, '');
  assert.ok(copiedStory.id !== story.id && copiedTask.id !== task.id); assert.equal(historyEvents.filter(event => event.details?.duplicateOf).length, 2);
  const retry = h.api.duplicateIssue(story.id, story.version, true, 'duplicate-1');
  assert.equal(retry.rootId, result.rootId); assert.equal(h.api.getProject().issues.length, 5);
});
test('content versions detect direct sheet edits even without an edit trigger', () => {
  const h = harness(), issue = h.api.saveIssue({ summary: 'Original' });
  h.rows[1][3] = 'Changed in Sheets';
  assert.throws(() => h.api.saveIssue({ id: issue.id, summary: 'Stale' }, issue.version), /changed elsewhere/);
});
test('row sorting does not change IDs or update the wrong record', () => {
  const h = harness(), first = h.api.saveIssue({ summary: 'First' }), second = h.api.saveIssue({ summary: 'Second' });
  [h.rows[1], h.rows[2]] = [h.rows[2], h.rows[1]];
  h.api.saveIssue({ id: first.id, summary: 'First updated' }, first.version);
  assert.equal(h.rows[1][0], second.id); assert.equal(h.rows[1][3], 'Second'); assert.equal(h.rows[2][3], 'First updated');
});
test('IDs are never reused after deleting the highest-numbered issue', () => {
  const h = harness(), first = h.api.saveIssue({ summary: 'First' });
  h.api.deleteIssue(first.id, first.version);
  assert.equal(h.api.saveIssue({ summary: 'Second' }).id, 'PRJ-2');
});
test('invalid saves leave the data intact and release the lock', () => {
  const h = harness(); assert.throws(() => h.api.saveIssue({ summary: '' })); assert.equal(h.rows.length, 1); assert.ok(h.balanced());
});
test('sample data never overwrites an existing project', () => {
  const h = harness(); h.api.saveIssue({ summary: 'Real work' });
  assert.throws(() => h.api.loadSampleData(), /empty/); assert.equal(h.rows[1][3], 'Real work');
});
test('duplicate IDs and changed headers produce useful errors', () => {
  const h = harness(); h.api.saveIssue({ summary: 'First' }); h.rows.push([...h.rows[1]]);
  assert.throws(() => h.api.getProject(), /Duplicate ID/);
  h.rows[0][0] = 'Renamed'; assert.throws(() => h.api.getProject(), /column headers/);
});
test('linked parent deletion is rejected by the server', () => {
  const h = harness(), epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' });
  h.api.saveIssue({ summary: 'Story', type: 'Story', parentId: epic.id });
  assert.throws(() => h.api.deleteIssue(epic.id, epic.version), /parent\/dependency/); assert.equal(h.rows.length, 3);
});
test('direct multiline pastes get unique IDs and preserve input fields', () => {
  const h = harness(); h.rows.push(Array(21).fill(''), Array(21).fill(''));
  h.rows[1][3] = 'Pasted one'; h.rows[2][3] = 'Pasted two'; h.rows[2][5] = 'Done'; h.rows[1][4] = 'Keep this description';
  h.api.handleSheetEdit({ range: h.sheet.getRange(2, 4, 2, 3) });
  assert.equal(h.rows[1][0], 'PRJ-1'); assert.equal(h.rows[2][0], 'PRJ-2');
  assert.equal(h.rows[1][1], 'Task'); assert.equal(h.rows[1][5], 'Backlog'); assert.equal(h.rows[2][14], 100);
  assert.equal(h.rows[1][4], 'Keep this description'); assert.ok(h.rows[2][11] instanceof Date);
});
test('direct edits validate rows and leave a correction note without discarding invalid input', () => {
  const h = harness(); h.rows.push(Array(21).fill(''));
  h.rows[1][3] = 'Bad dates'; h.rows[1][9] = '2026-11-10'; h.rows[1][10] = '2026-11-09';
  h.api.handleSheetEdit({ range: h.sheet.getRange(2, 10) });
  assert.equal(h.rows[1][10], '2026-11-09');
  assert.match(h.notes.get('2:4'), /Due date cannot be before start date/);
  h.rows[1][10] = '2026-11-11';
  h.api.handleSheetEdit({ range: h.sheet.getRange(2, 11) });
  assert.equal(h.notes.get('2:4'), '');
  assert.equal(h.rows[1][0], 'PRJ-1');
});
test('single-cell edits cannot change generated identity and ordering fields', () => {
  const h = harness(), issue = h.api.saveIssue({ summary: 'Keep ID' });
  h.rows[1][0] = 'PRJ-999';
  h.api.handleSheetEdit({ range: h.sheet.getRange(2, 1), oldValue: issue.id });
  assert.equal(h.rows[1][0], issue.id);
  assert.match(h.notes.get('2:1'), /managed by SheetFlow/);
});
test('formula-like text is stored as literal text', () => {
  const h = harness(); const issue = C.prepare({ summary: '=IMPORTXML("url", "path")' }, null, '2026-10-27', '2026-10-27T10:00:00Z');
  const row = h.api.toRow_(issue, h.book); assert.ok(row[3].startsWith("'="));
});

function duplicateUndoFixture() {
  const h = harness(), receipts = new Map(), events = [];
  h.api.SheetFlowHistory = {
    findReceipt: (_, id) => id && receipts.has(id) ? { result: receipts.get(id) } : null,
    receipt: (_, id, result) => { if (id) receipts.set(id, result); }, record: (_, event) => events.push(event)
  };
  const source = h.api.saveIssue({ summary: 'Original story', type: 'Story' });
  h.api.saveIssue({ summary: 'Original child', parentId: source.id });
  const duplicate = h.api.duplicateIssue(source.id, source.version, true, 'duplicate-tree');
  const expected = duplicate.items.map(({issue}) => ({ id: issue.id, expectedVersion: issue.version }));
  return { ...h, receipts, events, duplicate, expected };
}

test('duplicate undo removes only the copied tree, audits each removal, and replays safely', () => {
  const h = duplicateUndoFixture();
  const result = h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'undo-tree');
  assert.equal(result.ids.length, 2); assert.equal(result.archived, false);
  assert.equal(h.api.getProject().issues.length, 2);
  assert.equal(h.events.filter(event => event.details?.undoDuplicate === 'duplicate-tree').length, 2);
  assert.equal(h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'undo-tree'), result);
  assert.throws(() => h.api.undoDuplicateIssues('other-duplicate', h.expected, 'undo-tree'), /different duplicate/);
  assert.ok(h.balanced());
});

test('duplicate undo rejects stale, incomplete, forged, and duplicate revision lists before writes', () => {
  const h = duplicateUndoFixture();
  for (const items of [[], h.expected.slice(0, 1), [h.expected[0], h.expected[0]], h.expected.map(item => ({...item, expectedVersion:'forged'}))]) {
    assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', items, 'invalid-undo'), /Invalid|match|unique/);
    assert.equal(h.api.getProject().issues.length, 4);
  }
  const child = h.duplicate.items[1].issue;
  h.api.saveIssue({id:child.id, summary:'Later work'}, child.version);
  assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'stale-undo'), /changed after duplication/);
  assert.equal(h.api.getProject().issues.length, 4); assert.ok(h.balanced());
});

for (const link of ['parentId', 'dependencies']) test('duplicate undo preserves copies referenced by an external ' + link, () => {
  const h = duplicateUndoFixture();
  h.api.saveIssue({summary:'Later linked work', [link]:h.duplicate.rootId});
  assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'linked-undo'), /Other issues now reference/);
  assert.equal(h.api.getProject().issues.length, 5);
});

test('duplicate undo protects comments and requires write authorization', () => {
  const h = duplicateUndoFixture();
  h.api.SheetFlowComments = {read: () => [{taskId:h.duplicate.rootId,body:'Later discussion'}]};
  assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'comment-undo'), /Comments were added/);
  h.api.SheetFlowAuth = {require: () => {throw new Error('AUTH_FORBIDDEN');}};
  assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'forbidden-undo'), /AUTH_FORBIDDEN/);
  assert.equal(h.rows.length, 5); assert.ok(h.balanced());
});

test('failed legacy duplicate undo restores removed copies and can be retried', () => {
  const h = duplicateUndoFixture(), remove = h.sheet.deleteRow;
  let calls = 0;
  h.sheet.deleteRow = row => { if (++calls === 2) throw new Error('Injected delete failure'); return remove(row); };
  assert.throws(() => h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'retry-undo'), /Written changes were rolled back/);
  assert.equal(h.api.getProject().issues.length, 4);
  h.expected.forEach(item => assert.equal(h.api.getProject().issues.find(issue => issue.id === item.id).version, item.expectedVersion));
  h.sheet.deleteRow = remove;
  assert.equal(h.api.undoDuplicateIssues('duplicate-tree', h.expected, 'retry-undo').ids.length, 2);
  assert.ok(h.balanced());
});
