const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Core = require('../Core.js');

function harness(sourceIssues) {
  const properties = new Map([['SPREADSHEET_ID', 'test-book']]), sheets = {};
  function createSheet(name) {
    const rows = [];
    const sheet = {
      getName: () => name, getLastRow: () => rows.length, getMaxRows: () => 1000,
      setFrozenRows() {},
      getRange(row, column, height = 1, width = 1) {
        return {
          getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[column - 1 + c] ?? '')),
          setValues(values) { values.forEach((line, r) => { while (rows.length <= row - 1 + r) rows.push([]); line.forEach((value, c) => { rows[row - 1 + r][column - 1 + c] = value; }); }); return this; },
          setValue(value) { this.setValues([[value]]); return this; }
        };
      },
      rows
    };
    return sheet;
  }
  const context = vm.createContext({
    Date, console, TrackerCore: Core,
    SpreadsheetApp: { openById: id => { assert.equal(id, 'test-book'); return book; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '', getProperties: () => Object.fromEntries(properties), setProperty: (key, value) => properties.set(key, String(value)), deleteProperty: key => properties.delete(key) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? date.toLocaleDateString('en-CA', { timeZone: zone }) : date.toISOString(),
      parseDate: value => new Date(String(value).length === 10 ? value + 'T00:00:00.000Z' : value),
      DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, value) => crypto.createHash('sha256').update(value).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Schema.js'), 'utf8'), context);
  const book = {
    getSheetByName: name => sheets[name] || null,
    insertSheet(name) { return (sheets[name] = createSheet(name)); },
    getId: () => 'test-book', getUrl: () => 'https://docs.google.com/spreadsheets/d/test-book/edit', getName: () => 'Test',
    getSpreadsheetTimeZone: () => 'Europe/Prague'
  };
  const issues = sheets.Issues = createSheet('Issues');
  issues.rows.push(Core.fields.map(field => field.label));
  sourceIssues.forEach(item => issues.rows.push(Core.fields.map(field => {
    const value = item[field.key];
    if (field.kind === 'date' && value) return new Date(value + 'T00:00:00.000Z');
    if (field.kind === 'timestamp' && value) return new Date(value);
    return value ?? (field.kind === 'number' ? 0 : '');
  })));
  vm.runInContext(fs.readFileSync(require.resolve('../Repository.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../Settings.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../Code.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../Migrations.js'), 'utf8'), context);
  return { api: context, sheets, properties, book };
}

function sampleIssues() {
  return [
    Object.assign(Core.blank(), { id: 'PRJ-1', type: 'Epic', summary: 'Epic', status: 'In Progress', priority: 'High', rank: 100, startDate: '2026-10-01', dueDate: '2026-10-31' }),
    Object.assign(Core.blank(), { id: 'PRJ-2', type: 'Story', parentId: 'PRJ-1', summary: 'Story', status: 'To Do', priority: 'Medium', rank: 200 }),
    Object.assign(Core.blank(), { id: 'PRJ-3', type: 'Task', parentId: 'PRJ-2', summary: 'Nested task', status: 'Backlog', priority: 'Medium', rank: 300 }),
    Object.assign(Core.blank(), { id: 'PRJ-4', type: 'Bug', parentId: 'PRJ-1', summary: 'Bug', status: 'Review', priority: 'Highest', taskTypeId: 'bug', rank: 400 })
  ];
}

test('v2 migration preserves IDs, hierarchy, legacy JSON and permits a safe repeat', () => {
  const h = harness(sampleIssues());
  const preview = h.api.migrationDryRun();
  assert.equal(preview.canMigrate, true);
  assert.equal(preview.sourceRows, 4);
  const first = h.api.migrateLegacyIssues();
  assert.equal(first.migratedTasks, 3);
  assert.equal(first.migratedEpics, 1);
  assert.equal(first.schema.ready, true);
  const second = h.api.migrateLegacyIssues();
  assert.equal(second.alreadyMigrated, true);
  assert.equal(h.sheets.Tasks.rows.length, 4);
  const taskHeaders = h.sheets.Tasks.rows[0];
  const nested = h.sheets.Tasks.rows.find(row => row[0] === 'PRJ-3');
  assert.equal(nested[taskHeaders.indexOf('Parent Task ID')], 'PRJ-2');
  assert.equal(nested[taskHeaders.indexOf('Epic ID')], 'PRJ-1');
  assert.match(nested[taskHeaders.indexOf('Legacy JSON')], /Nested task/);
  assert.equal(h.sheets.Issues.rows.length, 5);
});

test('migration dry run blocks invalid parent references before copying', () => {
  const rows = sampleIssues(); rows[1].parentId = 'NO-SUCH-EPIC';
  const h = harness(rows);
  const result = h.api.migrationDryRun();
  assert.equal(result.canMigrate, false);
  assert.ok(result.invalid.some(item => item.issue === 'PRJ-2'));
  assert.equal(h.sheets.Tasks, undefined);
});

test('admin cutover routes CRUD to v2 and rollback carries v2 changes back to Issues', () => {
  const h = harness(sampleIssues());
  h.api.migrateLegacyIssues();
  const activated = h.api.activateVersionedRepository();
  assert.equal(activated.activeRepository, 'v2');
  const issue = h.api.getProject().issues.find(item => item.id === 'PRJ-3');
  const updated = h.api.saveIssue({ id: issue.id, summary: 'Updated in v2' }, issue.version);
  assert.equal(updated.summary, 'Updated in v2');
  const rollback = h.api.deactivateVersionedRepository();
  assert.equal(rollback.rollbackCopiedV2Changes, true);
  assert.equal(h.api.getProject().issues.find(item => item.id === 'PRJ-3').summary, 'Updated in v2');
  h.sheets.Issues.rows[3][3] = 'Native edit after rollback';
  assert.throws(() => h.api.activateVersionedRepository(), /changed after rollback/);
});
