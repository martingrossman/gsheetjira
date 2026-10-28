const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Core = require('../Core.js');

function harness() {
  const properties = new Map([['SPREADSHEET_ID', 'book-v2'], ['SHEETFLOW_ACTIVE_SCHEMA', '2']]);
  const tabs = {};
  const notes = new Map(), reads = [], logs = [];
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
          getValues: () => { reads.push({ name, row, col, height, width }); return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? '')); },
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
    Date, console: { log: (...args) => logs.push(args.join(' ')) }, TrackerCore: Core,
    SpreadsheetApp: { openById: () => book, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '', setProperty: (key, value) => properties.set(key, String(value)) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
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
  return { api: context, tabs, book, properties, notes, reads, logs };
}

function addRecord(sheet, record) {
  const headers = sheet.rows[0];
  sheet.rows.push(headers.map(header => record[header] ?? ''));
}

function assertBrowserValue(value, path = 'response') {
  assert.ok(!(value instanceof Date), `${path} must not contain a Date`);
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  assert.equal(typeof value, 'object', `${path} must contain browser-safe values`);
  Object.entries(value).forEach(([key, child]) => assertBrowserValue(child, `${path}.${key}`));
}

function loadBrowserServices(h) {
  for (const name of ['Settings', 'Comments', 'History']) vm.runInContext(fs.readFileSync(require.resolve(`../${name}.js`), 'utf8'), h.api);
  h.api.SheetFlowSettings.ensure(h.book);
}

for (const schema of ['1', '2']) test(`schema ${schema} project payload converts Sheet timestamps and omits internal records`, () => {
  const h = harness(); h.properties.set('SHEETFLOW_ACTIVE_SCHEMA', schema); loadBrowserServices(h);
  if (schema === '2') addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Active: true, Revision: 1 });
  const task = h.api.saveIssue({ summary: 'Browser transport', startDate: '2026-10-28', dueDate: '2026-10-29' });
  h.api.addTaskComment(task.id, 'A stored comment');
  const project = h.api.getProject();
  assertBrowserValue(project);
  assert.equal(project.issues[0].startDate, '2026-10-28');
  assert.ok(project.issues[0].version);
  assert.equal(Object.keys(project.issues[0]).some(key => key.startsWith('_')), false);
  assert.match(project.settings[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(project.comments[task.id][0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(h.tabs.Settings.rows[1][7] instanceof Date, 'stored timestamps remain native Sheet dates');
  assert.ok(h.tabs.Comments.rows[1][4] instanceof Date);
  if (schema === '2') assert.ok(h.api.readVersionedIssues_(h.book, false)[0]._record['Created At'] instanceof Date);
});

test('v2 mutation, comment, history, and replay results are safe for google.script.run', () => {
  const h = harness(); loadBrowserServices(h);
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Active: true, Revision: 1 });
  let task = h.api.saveIssue({ summary: 'RPC task', operationId: 'rpc-create' });
  assertBrowserValue(task); assert.equal(task._record, undefined);
  assertBrowserValue(h.api.saveIssue({ summary: 'Ignored retry', operationId: 'rpc-create' }));
  task = h.api.moveIssue(task.id, { rank: 2000 }, task.version, 'rpc-move'); assertBrowserValue(task);
  const batch = h.api.updateIssuesBatch([{ id: task.id, expectedVersion: task.version, operationId: 'rpc-bulk', updates: { priority: 'High' } }]);
  assertBrowserValue(batch); task = batch.items[0].issue;
  const duplicate = h.api.duplicateIssue(task.id, task.version, false, 'rpc-copy'); assertBrowserValue(duplicate);
  const copied = duplicate.items[0].issue;
  assert.equal(copied._record, undefined);
  assertBrowserValue(h.api.duplicateIssue(task.id, task.version, false, 'rpc-copy'));
  task = h.api.reorderIssue(task.id, copied.id, task.version); assertBrowserValue(task);
  const comment = h.api.addTaskComment(task.id, 'Initial comment'); assertBrowserValue(comment);
  assertBrowserValue(h.api.updateTaskComment(comment.id, 'Edited comment'));
  assertBrowserValue(h.api.getTaskComments(task.id));
  const archived = h.api.deleteIssue(task.id, task.version); assertBrowserValue(archived);
  assertBrowserValue(h.api.restoreIssue(task.id, archived.version));
  const history = h.api.getTaskHistory(task.id, 50, 0); assertBrowserValue(history);
  assert.match(history.items[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

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

test('issue duplication preserves hierarchy through the active versioned repository', () => {
  const h = harness();
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Order: 1, Active: true, Revision: 1 });
  const epic = h.api.saveIssue({ summary: 'Epic', type: 'Epic' });
  const story = h.api.saveIssue({ summary: 'Story', type: 'Story', parentId: epic.id });
  h.api.saveIssue({ summary: 'Task', parentId: story.id });
  const result = h.api.duplicateIssue(epic.id, epic.version, true, 'v2-duplicate-1');
  const issues = h.api.getProject().issues;
  assert.equal(result.items.length, 3);
  assert.equal(issues.find(issue => issue.id === result.items[1].issue.id).parentId, result.rootId);
  assert.equal(issues.find(issue => issue.id === result.items[2].issue.id).parentId, result.items[1].issue.id);
  assert.equal(issues.filter(issue => issue.type === 'Epic').length, 2);
});

function versionedDuplicateUndoFixture() {
  const h = harness(), receipts = new Map(), events = [];
  h.api.SheetFlowHistory = {
    findReceipt: (_, id) => id && receipts.has(id) ? {result:receipts.get(id)} : null,
    receipt: (_, id, result) => { if (id) receipts.set(id,result); }, record: (_, event) => events.push(event)
  };
  addRecord(h.tabs['Projects and Epics'], {ID:'PROJECT-1','Entity Kind':'Project',Title:'Project',Active:true,Revision:1});
  const epic = h.api.saveIssue({summary:'Original epic',type:'Epic'});
  const story = h.api.saveIssue({summary:'Original story',type:'Story',parentId:epic.id});
  h.api.saveIssue({summary:'Original task',parentId:story.id});
  const duplicate = h.api.duplicateIssue(epic.id,epic.version,true,'v2-tree');
  const expected = duplicate.items.map(({issue})=>({id:issue.id,expectedVersion:issue.version}));
  return {...h,duplicate,expected,receipts,events};
}

test('v2 duplicate undo archives the complete copied hierarchy and safely replays', () => {
  const h = versionedDuplicateUndoFixture();
  const result = h.api.undoDuplicateIssues('v2-tree',h.expected,'v2-undo');
  assert.equal(result.archived,true); assert.equal(result.ids.length,3);
  assert.equal(h.api.getProject().issues.length,3);
  const archived = h.api.readVersionedIssues_(h.book,true).filter(issue=>result.ids.includes(issue.id));
  assert.equal(archived.length,3); assert.ok(archived.every(issue=>issue._archivedAt));
  assert.equal(h.events.filter(event=>event.details?.undoDuplicate==='v2-tree' && event.eventKind==='archived').length,3);
  assert.equal(h.api.undoDuplicateIssues('v2-tree',h.expected,'v2-undo'),result);
});

test('failed v2 duplicate undo restores original revisions even after a partially applied write', () => {
  const h = versionedDuplicateUndoFixture(), upsert = h.api.SheetFlowRepository.upsert;
  let calls=0;
  h.api.SheetFlowRepository.upsert = (...args) => { const result=upsert(...args); if (++calls===2) throw new Error('Injected partial write'); return result; };
  assert.throws(()=>h.api.undoDuplicateIssues('v2-tree',h.expected,'v2-retry'), /Written changes were rolled back/);
  assert.equal(h.api.getProject().issues.length,6);
  h.expected.forEach(item=>assert.equal(h.api.getProject().issues.find(issue=>issue.id===item.id).version,item.expectedVersion));
  assert.equal(h.receipts.has('v2-retry'),false);
  h.api.SheetFlowRepository.upsert=upsert;
  assert.equal(h.api.undoDuplicateIssues('v2-tree',h.expected,'v2-retry').ids.length,3);
});

test('duplicate undo uses persisted history receipts after the history service reloads', () => {
  const h = harness(), historySource = fs.readFileSync(require.resolve('../History.js'), 'utf8');
  vm.runInContext(historySource, h.api);
  addRecord(h.tabs['Projects and Epics'], { ID: 'PROJECT-1', 'Entity Kind': 'Project', Title: 'Project', Active: true, Revision: 1 });
  const source = h.api.saveIssue({ summary: 'Persistent receipt source' });
  const duplicate = h.api.duplicateIssue(source.id, source.version, false, 'persistent-copy');
  const expected = duplicate.items.map(({ issue }) => ({ id: issue.id, expectedVersion: issue.version }));
  const undone = h.api.undoDuplicateIssues('persistent-copy', expected, 'persistent-undo');
  const rows = h.tabs['Change History'].rows.length;
  vm.runInContext(historySource, h.api);
  const replayed = h.api.undoDuplicateIssues('persistent-copy', expected, 'persistent-undo');
  assert.equal(JSON.stringify(replayed), JSON.stringify(undone));
  assert.equal(h.tabs['Change History'].rows.length, rows);
  assert.equal(h.api.getProject().issues.length, 1);
});

test('ordinary v2 saves reuse one locked snapshot and verify only the saved row', () => {
  const h = harness(); loadBrowserServices(h);
  addRecord(h.tabs['Projects and Epics'], {ID:'PROJECT-1','Entity Kind':'Project',Title:'Project',Active:true,Revision:1});
  const epic = h.api.saveIssue({summary:'Parent epic',type:'Epic'});
  for (let index = 0; index < 12; index++) h.api.saveIssue({summary:'Existing ' + index,parentId:epic.id});
  h.reads.length = 0;
  const saved = h.api.saveIssue({summary:'Measured save',parentId:epic.id,operationId:'measured-save'});
  const fullTasks = h.reads.filter(read => read.name==='Tasks' && read.row===2 && read.height>1);
  const projectReads = h.reads.filter(read => read.name==='Projects and Epics' && read.row===2);
  const systemReads = h.reads.filter(read => read.name==='_System' && read.row===2);
  const schemaHeaders = h.reads.filter(read => read.row===1 && read.name!=='Issues');
  console.log('V2 save read counts:',JSON.stringify({rangeReads:h.reads.length,taskRegisters:fullTasks.length,projectRegisters:projectReads.length,systemReads:systemReads.length,schemaHeaders:schemaHeaders.length}));
  assert.equal(fullTasks.length,1); assert.equal(projectReads.length,1); assert.equal(systemReads.length,1);
  assert.equal(schemaHeaders.length,Object.keys(h.api.SheetFlowSchema.tabs).length);
  const fresh = h.api.getProject().issues.find(issue=>issue.id===saved.id);
  assert.equal(saved.version,fresh.version);
  h.reads.length=0;
  assert.equal(h.api.saveIssue({summary:'Ignored retry',operationId:'measured-save'}).id,saved.id);
  assert.equal(h.reads.filter(read=>read.name==='Tasks').length,0);
});

test('legacy saves share operational reads and return the persisted task-type revision', () => {
  const h=harness();h.properties.set('SHEETFLOW_ACTIVE_SCHEMA','1');loadBrowserServices(h);
  for(let index=0;index<12;index++)h.api.saveIssue({summary:'Existing '+index});
  h.reads.length=0;
  const saved=h.api.saveIssue({summary:'Mapped category',taskTypeId:'data',operationId:'typed-create'});
  assert.equal(h.reads.filter(read=>read.name==='_System' && read.row===2).length,1);
  assert.equal(h.reads.filter(read=>read.name==='Issues' && read.row===2 && read.height>1).length,1);
  const fresh=h.api.getProject().issues.find(issue=>issue.id===saved.id);
  assert.equal(saved.taskTypeId,'data');assert.equal(saved.version,fresh.version);
  const updated=h.api.saveIssue({id:saved.id,summary:'Still editable',taskTypeId:'algo',operationId:'typed-update'},saved.version);
  assert.equal(updated.taskTypeId,'algo');assert.equal(updated.version,h.api.getProject().issues.find(issue=>issue.id===saved.id).version);
  assert.equal(h.api.saveIssue({summary:'Ignored',operationId:'typed-create'}).id,saved.id);
  assert.equal(h.api.getProject().issues.length,13);
});

test('optimized saves use fresh data on every request and retain v2 workflow metadata', () => {
  const h=harness();
  addRecord(h.tabs['Projects and Epics'],{ID:'PROJECT-1','Entity Kind':'Project',Title:'Project',Active:true,Revision:1});
  let task=h.api.saveIssue({summary:'Initial task',startDate:'2026-10-28',dueDate:'2026-10-29'});
  const headers=h.tabs.Tasks.rows[0],row=h.tabs.Tasks.rows.find(row=>row[0]===task.id);
  row[headers.indexOf('Acceptance Criteria')]='Keep acceptance criteria';row[headers.indexOf('Created By')]='original-creator';row[headers.indexOf('Claimed By')]='existing-claim';
  task=h.api.getProject().issues.find(issue=>issue.id===task.id);
  const updated=h.api.saveIssue({id:task.id,summary:'Updated task'},task.version);
  assert.equal(updated.version,h.api.getProject().issues.find(issue=>issue.id===task.id).version);
  assert.equal(row[headers.indexOf('Acceptance Criteria')],'Keep acceptance criteria');
  assert.equal(row[headers.indexOf('Created By')],'original-creator');assert.equal(row[headers.indexOf('Claimed By')],'existing-claim');
  assert.equal(updated.startDate,'2026-10-28');assert.equal(updated.dueDate,'2026-10-29');
  row[headers.indexOf('Title')]='Changed directly in Sheets';
  assert.throws(()=>h.api.saveIssue({id:task.id,summary:'Stale edit'},updated.version),/changed elsewhere/);
  assert.equal(row[headers.indexOf('Title')],'Changed directly in Sheets');
  const current=h.api.getProject().issues.find(issue=>issue.id===task.id);
  headers[headers.indexOf('Title')]='Broken header';
  assert.throws(()=>h.api.saveIssue({id:task.id,summary:'Unsafe edit'},current.version),/schema is incomplete/);
});

test('project refresh batches comment reads and excludes comments on unavailable issues', () => {
  const h=harness();loadBrowserServices(h);
  addRecord(h.tabs['Projects and Epics'],{ID:'PROJECT-1','Entity Kind':'Project',Title:'Project',Active:true,Revision:1});
  const first=h.api.saveIssue({summary:'First task'}),second=h.api.saveIssue({summary:'Second task'});
  h.api.addTaskComment(first.id,'First comment');h.api.addTaskComment(second.id,'Second comment');h.api.addTaskComment('missing-id','Orphan comment');
  h.reads.length=0;
  const project=h.api.getProject();
  assert.equal(h.reads.filter(read=>read.name==='Comments' && read.row===2).length,1);
  assert.equal(project.comments[first.id][0].body,'First comment');assert.equal(project.comments[second.id][0].body,'Second comment');
  assert.equal(project.comments['missing-id'],undefined);assertBrowserValue(project);
});
