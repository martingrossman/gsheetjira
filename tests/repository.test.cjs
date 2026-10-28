const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Core = require('../Core.js');

function harness() {
  const properties = new Map([['SPREADSHEET_ID', 'book-v2'], ['SHEETFLOW_ACTIVE_SCHEMA', '2']]);
  const tabs = {};
  const notes = new Map();
  let book;
  function makeSheet(name, headers) {
    const rows = [headers.slice()];
    const sheet = {
      getName: () => name,
      getLastRow: () => rows.length,
      getMaxRows: () => 1000,
      getParent: () => book,
      getRange(row, col, height = 1, width = 1) {
        return {
          getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? '')),
          setValues(values) { values.forEach((line, r) => { while (rows.length <= row - 1 + r) rows.push(Array(headers.length).fill('')); line.forEach((value, c) => { rows[row - 1 + r][col - 1 + c] = value; }); }); return this; },
          setValue(value) { this.setValues([[value]]); return this; },
          getRow: () => row, getLastRow: () => row + height - 1, getColumn: () => col, getLastColumn: () => col + width - 1,
          getNumRows: () => height, getNumColumns: () => width,
          getSheet: () => sheet,
          setNote(value) { notes.set(`${name}:${row}:${col}`, value); return this; }
        };
      },
      rows
    };
    return sheet;
  }
  const context = vm.createContext({
    Date, console, TrackerCore: Core,
    SpreadsheetApp: { openById: () => book, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '', setProperty: (key, value) => properties.set(key, String(value)) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? date.toLocaleDateString('en-CA', { timeZone: zone }) : date.toISOString(),
      parseDate: value => new Date(String(value).length === 10 ? value + 'T00:00:00.000Z' : value),
      DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, value) => crypto.createHash('sha256').update(value).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Schema.js'), 'utf8'), context);
  Object.keys(context.SheetFlowSchema.tabs).forEach(key => {
    const def = context.SheetFlowSchema.tabs[key]; tabs[def.name] = makeSheet(def.name, def.headers);
  });
  tabs.Issues = makeSheet('Issues', Core.fields.map(field => field.label));
  const system = tabs._System; system.rows.push(['SCHEMA_VERSION', context.SheetFlowSchema.version, new Date()]);
  book = {
    getSheetByName: name => tabs[name] || null,
    getId: () => 'book-v2', getUrl: () => 'https://docs.google.com/spreadsheets/d/book-v2/edit', getName: () => 'Project',
    getSpreadsheetTimeZone: () => 'Europe/Prague'
  };
  vm.runInContext(fs.readFileSync(require.resolve('../Repository.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../Code.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../Ordering.js'), 'utf8'), context);
  return { api: context, tabs, book, properties, notes };
}

function addRecord(sheet, record) {
  const headers = sheet.rows[0];
  sheet.rows.push(headers.map(header => record[header] ?? ''));
}

test('v2 repository reads hierarchical issues, writes edits, and supports archive restore', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PRJ-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  addRecord(h.tabs['Projects and Epics'], { ID: 'PRJ-2', 'Entity Kind': 'Epic', 'Project ID': 'PRJ-1', Title: 'Epic', Order: 100, Active: true, Revision: 1, 'Legacy JSON': JSON.stringify({ type: 'Epic', status: 'In Progress', priority: 'High', rank: 100 }) });
  addRecord(h.tabs.Tasks, { ID: 'PRJ-3', Kind: 'Story', 'Task Type ID': 'requirements', 'Project ID': 'PRJ-1', 'Epic ID': 'PRJ-2', Title: 'Story', Status: 'Ready', Priority: 'High', Order: 200, Revision: 1, 'Legacy JSON': JSON.stringify({ type: 'Story', createdAt: '2026-10-01T00:00:00.000Z', rank: 200 }) });
  const initial = h.api.getProject().issues;
  assert.deepEqual(Array.from(initial, issue => issue.type), ['Epic', 'Story']);
  assert.equal(initial[1].parentId, 'PRJ-2');
  assert.equal(initial[1].status, 'To Do');

  const task = h.api.saveIssue({ summary: 'Implementation', type: 'Task', parentId: 'PRJ-3', taskTypeId: 'algo' });
  assert.equal(task.parentId, 'PRJ-3');
  const taskRow = h.tabs.Tasks.rows.find(row => row[0] === task.id);
  const taskHeaders = h.tabs.Tasks.rows[0];
  assert.equal(taskRow[taskHeaders.indexOf('Parent Task ID')], 'PRJ-3');
  assert.equal(taskRow[taskHeaders.indexOf('Epic ID')], 'PRJ-2');
  const updated = h.api.saveIssue({ id: task.id, summary: 'Implementation updated' }, task.version);
  assert.equal(updated.summary, 'Implementation updated');

  const deleted = h.api.deleteIssue(task.id, updated.version);
  assert.equal(deleted.archived, true);
  assert.equal(h.api.getProject().issues.some(issue => issue.id === task.id), false);
  const restored = h.api.restoreIssue(task.id, deleted.version);
  assert.equal(restored.summary, 'Implementation updated');
  assert.equal(h.api.getProject().issues.some(issue => issue.id === task.id), true);
});

test('v2 rollback copies active repository edits back into Issues', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PRJ-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  const task = h.api.saveIssue({ summary: 'Versioned task' });
  assert.equal(h.tabs.Issues.rows.length, 1);
  const result = h.api.deactivateVersionedRepository();
  assert.equal(result.activeRepository, 'legacy');
  assert.equal(h.api.getProject().issues[0].summary, 'Versioned task');
  assert.equal(h.tabs.Issues.rows[1][3], 'Versioned task');
  assert.ok(task.id);
});

test('native edits on the active Tasks tab receive defaults and validation notes', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  const headers = h.tabs.Tasks.rows[0], row = Array(headers.length).fill('');
  row[headers.indexOf('Title')] = 'Direct task';
  h.tabs.Tasks.rows.push(row);
  const titleColumn = headers.indexOf('Title') + 1;
  h.api.handleSheetEdit({ range: h.tabs.Tasks.getRange(2, titleColumn) });
  assert.equal(h.tabs.Tasks.rows[1][headers.indexOf('Kind')], 'Task');
  assert.equal(h.tabs.Tasks.rows[1][headers.indexOf('Status')], 'Backlog');
  assert.equal(h.tabs.Tasks.rows[1][headers.indexOf('Task Type ID')], 'algo');
  assert.match(h.tabs.Tasks.rows[1][headers.indexOf('ID')], /^PRJ-\d+$/);
  const assignedId = h.tabs.Tasks.rows[1][headers.indexOf('ID')];
  h.tabs.Tasks.rows[1][headers.indexOf('ID')] = 'CHANGED-ID';
  const idColumn = headers.indexOf('ID') + 1;
  h.api.handleSheetEdit({ range: h.tabs.Tasks.getRange(2, idColumn) });
  assert.equal(h.tabs.Tasks.rows[1][idColumn - 1], assignedId);
  assert.match(h.notes.get(`Tasks:2:${titleColumn}`), /ID is managed/);
  const statusColumn = headers.indexOf('Status') + 1;
  h.tabs.Tasks.rows[1][statusColumn - 1] = 'Invalid status';
  h.api.handleSheetEdit({ range: h.tabs.Tasks.getRange(2, statusColumn) });
  assert.match(h.notes.get(`Tasks:2:${titleColumn}`), /valid status/);
  assert.equal(h.tabs.Tasks.rows[1][statusColumn - 1], 'Invalid status');
});

test('server ordering writes ranks through the active versioned repository', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  const first = h.api.saveIssue({ summary: 'First' });
  const second = h.api.saveIssue({ summary: 'Second' });
  const moved = h.api.reorderIssue(second.id, first.id, second.version);
  assert.equal(moved.id, second.id);
  assert.equal(moved.rank, 1000);
  assert.deepEqual(Array.from(h.api.getProject().issues, issue => issue.summary), ['Second', 'First']);
});

test('bounded bulk updates write every selected record through the active versioned repository', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  const epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' });
  const task = h.api.saveIssue({ summary: 'Task', parentId: epic.id });
  const result = h.api.updateIssuesBatch([
    { id: epic.id, expectedVersion: epic.version, operationId: 'v2-bulk-1', updates: { status: 'In Progress' } },
    { id: task.id, expectedVersion: task.version, operationId: 'v2-bulk-2', updates: { priority: 'Highest' } }
  ]);
  assert.equal(result.errors.length, 0);
  const issues = h.api.getProject().issues;
  assert.equal(issues.find(issue => issue.id === epic.id).status, 'In Progress');
  assert.equal(issues.find(issue => issue.id === task.id).priority, 'Highest');
  assert.equal(issues.find(issue => issue.id === task.id).parentId, epic.id);
});
