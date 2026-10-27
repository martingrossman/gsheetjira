const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const C = require('../Core.js');
function harness() {
  const rows = [C.fields.map(f => f.label)];
  const props = new Map([['SPREADSHEET_ID', 'book-1']]);
  let locks = 0, releases = 0;
  function range(row, column, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[column - 1 + c] ?? '')),
      setValues: values => { values.forEach((line, r) => line.forEach((value, c) => { if (!rows[row - 1 + r]) rows[row - 1 + r] = Array(C.fields.length).fill(''); rows[row - 1 + r][column - 1 + c] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value; })); },
      setValue: value => range(row, column).setValues([[value]]),
      getRow: () => row, getLastRow: () => row + height - 1, getColumn: () => column, getLastColumn: () => column + width - 1,
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
  return { api: context, rows, props, sheet, book, balanced: () => locks === releases };
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
test('formula-like text is stored as literal text', () => {
  const h = harness(); const issue = C.prepare({ summary: '=IMPORTXML("url", "path")' }, null, '2026-10-27', '2026-10-27T10:00:00Z');
  const row = h.api.toRow_(issue, h.book); assert.ok(row[3].startsWith("'="));
});
