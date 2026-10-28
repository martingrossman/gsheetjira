/** Google Sheets storage and web-app entry points. Run setupTracker once. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SheetFlow')
    .addItem('Set up / repair tracker', 'setupTracker')
    .addItem('Open tracker', 'openTracker')
    .addItem('Quick add work item', 'openQuickAdd')
    .addItem('Check schema health', 'schemaHealthCheck')
    .addItem('Run startup health check', 'startupHealthCheck')
    .addItem('Preview v2 migration', 'migrationDryRun')
    .addItem('Migrate legacy Issues to v2 tabs', 'migrateLegacyIssues')
    .addItem('Activate v2 repository', 'activateVersionedRepository')
    .addItem('Roll back to Issues repository', 'deactivateVersionedRepository')
    .addItem('Add sample project to empty tracker', 'loadSampleData').addToUi();
}

function setupTracker() {
  authorizationService_().require('configure');
  return withLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var id = environmentSpreadsheetId_();
    var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book) book = SpreadsheetApp.create('SheetFlow — Project tracker');
    var sheet = book.getSheetByName('Issues');
    if (!sheet) sheet = book.insertSheet('Issues');
    if (sheet.getLastRow() > 0) assertHeaders_(sheet);
    properties.setProperty('SPREADSHEET_ID', book.getId());
    var environment = typeof SheetFlowEnvironment !== 'undefined' ? SheetFlowEnvironment.config().name : 'development';
    properties.setProperty('SHEETFLOW_SPREADSHEET_ID_' + environment.toUpperCase(), book.getId());
    formatSheet_(sheet);
    if (typeof ensureSchemaTabs_ === 'function') ensureSchemaTabs_(book);
    var hasEditTrigger = ScriptApp.getProjectTriggers().some(function (trigger) {
      return trigger.getHandlerFunction() === 'handleSheetEdit' && trigger.getTriggerSourceId() === book.getId();
    });
    if (!hasEditTrigger) ScriptApp.newTrigger('handleSheetEdit').forSpreadsheet(book).onEdit().create();
    properties.setProperty('EDIT_TRIGGER_INSTALLED', 'true');
    console.log('Tracker spreadsheet: ' + book.getUrl());
    return { spreadsheetUrl: book.getUrl(), message: 'Tracker ready. Deploy as a web app to open all three views.' };
  });
}

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  var view = e && e.parameter && e.parameter.view;
  template.initialView = ['sheet', 'kanban', 'gantt'].indexOf(view) >= 0 ? view : 'kanban';
  return template.evaluate().setTitle('SheetFlow — Project tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function openTracker() {
  var url = ScriptApp.getService().getUrl();
  if (!url) { SpreadsheetApp.getUi().alert('Deploy this project as a Web app first (Deploy → New deployment).'); return; }
  var html = HtmlService.createHtmlOutput('<p><a href="' + url + '" target="_blank" rel="noopener">Open SheetFlow</a></p>');
  SpreadsheetApp.getUi().showModalDialog(html, 'Project tracker');
}
function openQuickAdd() {
  authorizationService_().require('write');
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('QuickAdd').setTitle('Quick add'));
}
function quickCreateIssue(title, type, parentId, operationId) {
  authorizationService_().require('write');
  title = String(title || '').trim(); type = String(type || 'Task'); parentId = String(parentId || '');
  if (!title) throw new Error('Enter a title before adding the item.');
  var book = getBook_(), settings = typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.read(book) : [];
  var taskType = settings.find(function (setting) { return setting.category === 'workflow' && setting.key === 'defaultTaskType'; });
  var status = settings.find(function (setting) { return setting.category === 'workflow' && setting.key === 'defaultStatus'; });
  return saveIssue({ summary: title, type: type, parentId: parentId, taskTypeId: taskType && taskType.value || 'algo', status: status && status.value || 'Backlog', priority: 'Medium', operationId: operationId || '' });
}
function getProject() {
  return withLock_(function () {
    authorizationService_().require('read');
    var book = getBook_();
    if (typeof trackerMode_ === 'function' && trackerMode_() === 'personal') personalSaveMetadata_(book.getId(), book, true);
    var issues = readIssues_(book);
    return browserValue_({ issues: issues.map(clientIssue_), comments: {}, commentsLazy: true, mode: typeof trackerMode_ === 'function' ? trackerMode_() : 'team', settings: typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.read(book) : [], spreadsheetUrl: book.getUrl(), name: book.getName(), serverTime: new Date().toISOString() });
  });
}
/** expectedVersion prevents an old browser tab overwriting a newer row. */
function saveIssue(input, expectedVersion) {
  var started = Date.now(), timing = { outcome: 'failed' };
  try {
    return withLock_(function () {
      timing.lockWaitMs = Date.now() - started;
      var mark = Date.now(); authorizationService_().require('write'); timing.authorizeMs = Date.now() - mark;
      mark = Date.now();
      var fastRead = input && input.operationId && typeof trackerMode_ === 'function' && trackerMode_() === 'personal' && typeof Sheets !== 'undefined' && getRepositoryProperty_('SHEETFLOW_ACTIVE_SCHEMA') !== '2';
      var book = fastRead ? readPersonalSaveBook_() : getBook_(); timing.openBookMs = Date.now() - mark;
      var result = saveIssueLocked_(book, input, expectedVersion, timing);
      timing.outcome = timing.replayed ? 'replayed' : 'saved';
      return result;
    });
  } finally {
    timing.totalServerMs = Date.now() - started;
    console.log('SheetFlow save timing ' + JSON.stringify(timing));
  }
}
function createIssuesBatch(items) {
  return withLock_(function () {
    authorizationService_().require('write');
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Submit between 1 and 100 issue titles per batch.');
    var book = getBook_(), results = [], errors = [], operationIds = new Set();
    items.forEach(function (item, index) {
      try {
        if (!item || !item.input || typeof item.input !== 'object') throw new Error('Missing issue fields.');
        var input = Object.assign({}, item.input), operationId = String(item.operationId || input.operationId || Utilities.getUuid());
        if (operationIds.has(operationId)) throw new Error('Each batch item needs a unique operation ID.');
        operationIds.add(operationId); input.operationId = operationId;
        results.push({ index: index, issue: saveIssueLocked_(book, input, item.expectedVersion) });
      } catch (error) { errors.push({ index: index, message: error && error.message ? error.message : String(error) }); }
    });
    return { items: results, errors: errors };
  });
}
/** Validate a bounded bulk edit completely before writing any issue rows. */
function updateIssuesBatch(items) {
  return withLock_(function () {
    authorizationService_().require('write');
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Select between 1 and 100 issues for a bulk edit.');
    var book = getBook_(), history = historyService_(), issues = readIssues_(book), ids = new Set(), operationIds = new Set(), prepared = [], errors = [], receipts = [];
    items.forEach(function (item) {
      try {
        if (!item || !item.id || !item.updates || typeof item.updates !== 'object' || Array.isArray(item.updates)) throw new Error('Missing issue fields.');
        if (ids.has(String(item.id))) throw new Error('An issue can appear only once in a bulk edit.');
        ids.add(String(item.id));
        var keys = Object.keys(item.updates), supported = ['status', 'assignee', 'priority', 'parentId', 'taskTypeId', 'startDate', 'dueDate'];
        if (keys.length !== 1 || supported.indexOf(keys[0]) < 0) throw new Error('Choose one supported field for the bulk edit.');
        if (item.restoreProgress !== undefined && (keys[0] !== 'status' || !Number.isFinite(Number(item.restoreProgress)) || Number(item.restoreProgress) < 0 || Number(item.restoreProgress) > 100)) throw new Error('Invalid progress restoration value.');
        var operationId = String(item.operationId || '');
        if (!operationId || operationIds.has(operationId)) throw new Error('Each issue needs a unique operation ID.');
        operationIds.add(operationId);
        var previousReceipt = history.findReceipt(book, operationId);
        receipts.push(previousReceipt);
        if (previousReceipt) return;
        var current = issues.find(function (issue) { return issue.id === String(item.id); });
        if (!current) throw new Error('This issue no longer exists. Refresh the project.');
        if (!item.expectedVersion || current.version !== item.expectedVersion) throw new Error('This issue changed elsewhere. Refresh, then apply the bulk edit again.');
        var input = { id: current.id }; input[keys[0]] = item.updates[keys[0]];
        var updatedIssue = TrackerCore.prepare(input, current, today_(book), new Date().toISOString());
        if (item.restoreProgress !== undefined) updatedIssue.progress = Number(item.restoreProgress);
        prepared.push({ item: item, current: current, field: keys[0], operationId: operationId, issue: updatedIssue });
      } catch (error) { errors.push({ id: item && item.id || '', message: error && error.message ? error.message : String(error) }); }
    });
    if (errors.length) return { items: [], errors: errors, rejected: true };
    var acceptedReceipts = receipts.filter(Boolean);
    if (acceptedReceipts.length) {
      if (acceptedReceipts.length !== items.length) return { items: [], errors: [{ id: '', message: 'A previous bulk operation is only partly recorded. Refresh the project before retrying.' }], rejected: true };
      return { items: acceptedReceipts.map(function (receipt, index) { return { id: items[index].id, issue: clientIssue_(receipt.result) }; }), errors: [], replayed: true };
    }
    var projected = issues.map(function (issue) {
      var change = prepared.find(function (entry) { return entry.current.id === issue.id; });
      return change ? change.issue : issue;
    });
    prepared.forEach(function (entry) {
      try { TrackerCore.validate(entry.issue, projected); }
      catch (error) { errors.push({ id: entry.current.id, message: error && error.message ? error.message : String(error) }); }
    });
    if (errors.length) return { items: [], errors: errors, rejected: true };
    var written = [];
    try {
      prepared.forEach(function (entry) { writeIssue_(book, entry.issue, entry.current); written.push(entry); });
      if (!versionedRepositoryActive_(book) && typeof SheetFlowSettings !== 'undefined') prepared.forEach(function (entry) {
        if (entry.field === 'taskTypeId' && entry.current.taskTypeId !== entry.issue.taskTypeId) SheetFlowSettings.setTaskType(book, entry.current.id, entry.issue.taskTypeId);
      });
      SpreadsheetApp.flush();
    } catch (writeError) {
      var rollbackErrors = [];
      written.slice().reverse().forEach(function (entry) {
        try {
          writeIssue_(book, entry.current, Object.assign({}, entry.issue, { _row: entry.current._row }));
          if (!versionedRepositoryActive_(book) && typeof SheetFlowSettings !== 'undefined' && entry.field === 'taskTypeId') SheetFlowSettings.setTaskType(book, entry.current.id, entry.current.taskTypeId);
        } catch (rollbackError) { rollbackErrors.push(rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)); }
      });
      SpreadsheetApp.flush();
      throw new Error('Bulk update failed during save. ' + (rollbackErrors.length ? 'Some rows could not be restored; run Refresh and review the project. ' : 'All written rows were restored. ') + (writeError && writeError.message ? writeError.message : String(writeError)));
    }
    var savedIssues = readIssues_(book), results = [];
    prepared.forEach(function (entry) {
      var saved = clientIssue_(savedIssues.find(function (issue) { return issue.id === entry.current.id; }));
      var changedFields = TrackerCore.fields.filter(function (field) { return entry.current[field.key] !== saved[field.key]; }).map(function (field) { return field.key; });
      if (entry.current.taskTypeId !== saved.taskTypeId) changedFields.push('taskTypeId');
      history.record(book, { operationId: entry.operationId, entityId: saved.id, eventKind: 'updated', beforeRevision: entry.current.version, afterRevision: saved.version, changedFields: changedFields, details: { source: 'app', bulk: true } });
      history.receipt(book, entry.operationId, saved);
      results.push({ id: saved.id, issue: saved });
    });
    return { items: results, errors: [] };
  });
}
/** Duplicate one issue and optionally its complete descendant tree. */
function duplicateIssue(id, expectedVersion, includeSubtasks, operationId) {
  return withLock_(function () {
    authorizationService_().require('write');
    operationId = String(operationId || '');
    if (!operationId) throw new Error('A duplicate operation ID is required.');
    var book = getBook_(), history = historyService_(), previousReceipt = history.findReceipt(book, operationId);
    if (previousReceipt) return { rootId: previousReceipt.result.rootId, items: previousReceipt.result.items.map(function (entry) { return { sourceId: entry.sourceId, issue: clientIssue_(entry.issue) }; }) };
    var issues = readIssues_(book), source = issues.find(function (issue) { return issue.id === id; });
    if (!source) throw new Error('This issue no longer exists. Refresh the project.');
    if (!expectedVersion || source.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh before duplicating it.');
    var sources = [source];
    if (includeSubtasks) {
      function collectChildren(parentId) {
        TrackerCore.sorted(issues.filter(function (issue) { return issue.parentId === parentId; })).forEach(function (child) { sources.push(child); collectChildren(child.id); });
      }
      collectChildren(source.id);
    }
    if (sources.length > 100) throw new Error('A duplicate can include at most 100 issues. Duplicate a smaller section of the hierarchy.');
    var copies = [], idMap = {}, now = new Date().toISOString(), generated = ['id', 'parentId', 'status', 'progress', 'timeSpent', 'completedDate', 'createdAt', 'updatedAt', 'rank'];
    sources.forEach(function (original) {
      var copy = TrackerCore.blank();
      TrackerCore.fields.forEach(function (field) { if (generated.indexOf(field.key) < 0) copy[field.key] = original[field.key]; });
      copy.id = nextId_(issues.concat(copies.map(function (entry) { return entry.issue; })));
      copy.parentId = original.id === source.id ? source.parentId : (idMap[original.parentId] || original.parentId);
      copy.taskTypeId = original.taskTypeId || 'algo'; copy.status = 'Backlog'; copy.progress = 0; copy.timeSpent = 0; copy.completedDate = '';
      copy.createdAt = now; copy.updatedAt = now;
      var all = issues.concat(copies.map(function (entry) { return entry.issue; }));
      var lastRank = all.filter(function (issue) { return issue.parentId === copy.parentId && issue.status === copy.status; }).reduce(function (max, issue) { return Math.max(max, Number(issue.rank) || 0); }, 0);
      copy.rank = lastRank + 1000;
      idMap[original.id] = copy.id; copies.push({ sourceId: original.id, issue: copy });
    });
    var projected = issues.concat(copies.map(function (entry) { return entry.issue; })), errors = [];
    copies.forEach(function (entry) { try { TrackerCore.validate(entry.issue, projected); } catch (error) { errors.push(entry.sourceId + ': ' + (error && error.message ? error.message : String(error))); } });
    if (errors.length) throw new Error('This hierarchy cannot be duplicated: ' + errors.join(' '));
    var versioned = versionedRepositoryActive_(book), written = [];
    try {
      copies.forEach(function (entry) {
        writeIssue_(book, entry.issue, null); written.push(entry);
        if (!versioned && typeof SheetFlowSettings !== 'undefined') SheetFlowSettings.setTaskType(book, entry.issue.id, entry.issue.taskTypeId);
      });
      SpreadsheetApp.flush();
    } catch (writeError) {
      var rollbackErrors = [];
      if (versioned) {
        written.forEach(function (entry) {
          try { var saved = readVersionedIssues_(book, true).find(function (issue) { return issue.id === entry.issue.id; }); if (saved) archiveVersionedIssue_(book, saved); }
          catch (rollbackError) { rollbackErrors.push(rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)); }
        });
      } else {
        try {
          var legacySheet = book.getSheetByName('Issues'), copiedIds = new Set(written.map(function (entry) { return entry.issue.id; }));
          readIssues_(book).filter(function (issue) { return copiedIds.has(issue.id); }).sort(function (a, b) { return b._row - a._row; }).forEach(function (issue) { legacySheet.deleteRow(issue._row); });
        } catch (rollbackError) { rollbackErrors.push(rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)); }
      }
      SpreadsheetApp.flush();
      throw new Error('Duplicate save failed. ' + (rollbackErrors.length ? 'Some copies could not be removed; refresh and review the project. ' : 'Written copies were rolled back. ') + (writeError && writeError.message ? writeError.message : String(writeError)));
    }
    var savedIssues = versioned ? readVersionedIssues_(book, false) : readIssues_(book);
    var results = copies.map(function (entry) {
      var saved = clientIssue_(savedIssues.find(function (issue) { return issue.id === entry.issue.id; }));
      history.record(book, { operationId: operationId + ':' + entry.sourceId, entityId: saved.id, eventKind: 'created', beforeRevision: '', afterRevision: saved.version, changedFields: TrackerCore.fields.map(function (field) { return field.key; }).concat(['taskTypeId']), details: { source: 'app', duplicateOf: entry.sourceId, operationId: operationId } });
      return { sourceId: entry.sourceId, issue: saved };
    });
    var result = { rootId: results[0].issue.id, items: results };
    history.receipt(book, operationId, result);
    return result;
  });
}
/** Remove a duplicate issue tree only when every copy still has its original revision. */
function undoDuplicateIssues(duplicateOperationId, expectedItems, undoOperationId) {
  return withLock_(function () {
    authorizationService_().require('write');
    duplicateOperationId = String(duplicateOperationId || ''); undoOperationId = String(undoOperationId || '');
    if (!duplicateOperationId || !undoOperationId) throw new Error('Duplicate and undo operation IDs are required.');
    if (!Array.isArray(expectedItems) || !expectedItems.length || expectedItems.length > 100) throw new Error('Invalid duplicate undo request.');
    var book = getBook_(), history = historyService_(), previousUndo = history.findReceipt(book, undoOperationId);
    if (previousUndo) {
      if (previousUndo.result.duplicateOperationId !== duplicateOperationId) throw new Error('This undo operation ID belongs to a different duplicate.');
      return previousUndo.result;
    }
    var duplicateReceipt = history.findReceipt(book, duplicateOperationId);
    var issues = readIssues_(book), comments = typeof SheetFlowComments !== 'undefined' ? SheetFlowComments.read(book) : [];
    var created = TrackerCore.duplicateUndoItems(issues, duplicateReceipt && duplicateReceipt.result, expectedItems, comments);
    var versioned = versionedRepositoryActive_(book), ordered = created.slice().reverse(), changed = [];
    try {
      if (versioned) {
        ordered.forEach(function (copy) { changed.push(copy.id); archiveVersionedIssue_(book, issues.find(function (issue) { return issue.id === copy.id; })); });
      } else {
        var legacySheet = book.getSheetByName('Issues');
        ordered.map(function (copy) { return issues.find(function (issue) { return issue.id === copy.id; }); }).sort(function (a, b) { return b._row - a._row; }).forEach(function (issue) { legacySheet.deleteRow(issue._row); changed.push(issue.id); });
      }
      SpreadsheetApp.flush();
    } catch (writeError) {
      var rollbackErrors = [];
      if (versioned) {
        changed.slice().reverse().forEach(function (id) {
          try { var original = issues.find(function (issue) { return issue.id === id; }); SheetFlowRepository.upsert(book, original._storageTab, original._record); }
          catch (rollbackError) { rollbackErrors.push(rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)); }
        });
      } else {
        changed.slice().reverse().forEach(function (id) {
          try {
            var original = issues.find(function (issue) { return issue.id === id; });
            writeIssue_(book, original, null);
            if (typeof SheetFlowSettings !== 'undefined') SheetFlowSettings.setTaskType(book, original.id, original.taskTypeId);
          } catch (rollbackError) { rollbackErrors.push(rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError)); }
        });
      }
      SpreadsheetApp.flush();
      throw new Error('Duplicate undo failed. ' + (rollbackErrors.length ? 'Some copies could not be restored; refresh and review the project. ' : 'Written changes were rolled back. ') + (writeError && writeError.message ? writeError.message : String(writeError)));
    }
    var archivedIssues = versioned ? readVersionedIssues_(book, true) : [], ids = created.map(function (issue) { return issue.id; });
    created.forEach(function (copy) {
      var archived = versioned && archivedIssues.find(function (issue) { return issue.id === copy.id; });
      history.record(book, { operationId: undoOperationId + ':' + copy.id, entityId: copy.id, eventKind: versioned ? 'archived' : 'deleted', beforeRevision: copy.version, afterRevision: archived && archived.version || '', changedFields: [], details: { source: 'app', undoDuplicate: duplicateOperationId } });
    });
    var result = { duplicateOperationId: duplicateOperationId, ids: ids, archived: versioned };
    history.receipt(book, undoOperationId, result);
    return result;
  });
}
function saveIssueLocked_(book, input, expectedVersion, timing) {
  timing = timing || {};
  var mark = Date.now(), systemRows = readSystemRows_(book);
  var operationId = input && input.operationId, history = historyService_();
  var previousReceipt = history.findReceipt(book, operationId, systemRows);
  if (previousReceipt) { timing.replayed = true; timing.readMs = Date.now() - mark; return clientIssue_(previousReceipt.result); }
  var snapshot = { systemRows: systemRows, versioned: versionedRepositoryActive_(book, systemRows) };
  if (snapshot.versioned) {
    snapshot.tasks = SheetFlowRepository.records(book, 'tasks');
    snapshot.projects = SheetFlowRepository.records(book, 'projects');
  } else snapshot.taskTypes = typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.taskTypeMap(book, systemRows) : {};
  var issues = readIssues_(book, snapshot); snapshot.issues = issues;
  timing.schema = snapshot.versioned ? 'v2' : 'legacy'; timing.readMs = Date.now() - mark;
  mark = Date.now();
  var current = input.id ? issues.find(function (i) { return i.id === input.id; }) : null;
  if (input.id && !current) throw new Error('This issue no longer exists. Refresh the project.');
  if (current && current.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh, then apply your changes again.');
  var issue = TrackerCore.prepare(input, current, today_(book), new Date().toISOString());
  if (!current) issue.id = nextId_(issues);
  TrackerCore.validate(issue, issues);
  timing.validateMs = Date.now() - mark;
  if (book._personalSave && !snapshot.versioned && typeof Sheets !== 'undefined' && operationId) {
    return savePersonalIssueBatch_(book, issue, current, snapshot, operationId, timing);
  }
  mark = Date.now();
  var written = writeIssue_(book, issue, current, snapshot);
  if (!snapshot.versioned) {
    written.taskTypeId = snapshot.taskTypes[issue.id] || 'algo';
    if (typeof SheetFlowSettings !== 'undefined' && written.taskTypeId !== issue.taskTypeId) written.taskTypeId = SheetFlowSettings.setTaskType(book, issue.id, issue.taskTypeId, systemRows) || written.taskTypeId;
  }
  SpreadsheetApp.flush();
  timing.writeMs = Date.now() - mark; mark = Date.now();
  var saved = clientIssue_(readWrittenIssue_(book, written, issue));
  timing.verifyMs = Date.now() - mark; mark = Date.now();
  var changedFields = TrackerCore.fields.filter(function (field) { return !current || current[field.key] !== saved[field.key]; }).map(function (field) { return field.key; });
  if (!current || current.taskTypeId !== saved.taskTypeId) changedFields.push('taskTypeId');
  var event = { operationId: operationId, entityId: saved.id, eventKind: current ? 'updated' : 'created', beforeRevision: current && current.version, afterRevision: saved.version, changedFields: changedFields, details: { source: 'app' } };
  if (history.recordAndReceipt) history.recordAndReceipt(book, event, operationId, saved, systemRows);
  else { history.record(book, event); history.receipt(book, operationId, saved, systemRows); }
  SpreadsheetApp.flush();
  timing.journalMs = Date.now() - mark;
  return saved;
}
/** One fresh API read supplies the metadata and both ranges needed by a personal legacy save. */
function readPersonalSaveBook_() {
  var id = environmentSpreadsheetId_();
  if (!id) throw new Error('Run setupTracker in the Apps Script editor first.');
  var reference = personalSaveMetadata_(id), names = ['Issues', '_System'], metadata = reference.sheets;
  var ranges = ["'Issues'!A:U", "'_System'!A:B"], zone = reference.zone;
  var result = Sheets.Spreadsheets.Values.batchGet(id, { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }), sheets = {};
  names.forEach(function (name, index) {
    var meta = metadata[name], rows = (result.valueRanges[index] || {}).values || [];
    rows = rows.map(function (row, rowIndex) { return row.map(function (value, column) {
      var kind = name === 'Issues' && rowIndex > 0 && TrackerCore.fields[column] && TrackerCore.fields[column].kind;
      if (typeof value === 'number' && (kind === 'date' || kind === 'timestamp')) {
        var local = new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, -1);
        return Utilities.parseDate(local, zone, "yyyy-MM-dd'T'HH:mm:ss.SSS");
      }
      return value;
    }); });
    sheets[name] = {
      getName: function () { return name; }, getSheetId: function () { return meta.sheetId; },
      getMaxRows: function () { return meta.rowCount; }, getLastRow: function () { return Math.max(1, rows.length); },
      getRange: function (row, column, height, width) { return { getValues: function () {
        return Array.from({ length: height || 1 }, function (_, r) { return Array.from({ length: width || 1 }, function (_, c) { return rows[row - 1 + r] && rows[row - 1 + r][column - 1 + c] != null ? rows[row - 1 + r][column - 1 + c] : ''; }); });
      } }; }
    };
  });
  assertHeaders_(sheets.Issues);
  return { _personalSave: true, getId: function () { return id; }, getSheetByName: function (name) { return sheets[name] || null; }, getSpreadsheetTimeZone: function () { return zone; } };
}
/** Cache only sheet identities/geometry/time zone, never tasks, receipts or permissions. */
function personalSaveMetadata_(id, source, refresh) {
  var cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  var key = 'PERSONAL_SAVE_META_V1:' + id, cached;
  if (cache && !refresh) {
    try { cached = JSON.parse(cache.get(key) || 'null'); } catch (ignore) {}
    if (cached && cached.zone && cached.sheets && ['Issues', '_System'].every(function (name) { return cached.sheets[name] && Number.isInteger(cached.sheets[name].sheetId) && cached.sheets[name].rowCount > 0; })) return cached;
  }
  source = source || SpreadsheetApp.openById(id);
  var result = { zone: source.getSpreadsheetTimeZone(), sheets: {} };
  ['Issues', '_System'].forEach(function (name) {
    var sheet = source.getSheetByName(name);
    if (!sheet) throw new Error('Personal mode requires Issues and _System. Run setupTracker.');
    if (typeof sheet.getSheetId !== 'function') return;
    result.sheets[name] = { sheetId: sheet.getSheetId(), rowCount: sheet.getMaxRows() };
  });
  if (cache && result.sheets.Issues && result.sheets._System) { try { cache.put(key, JSON.stringify(result), 30); } catch (ignore) {} }
  return result;
}
function invalidatePersonalSaveMetadata_(id) {
  if (typeof CacheService !== 'undefined') { try { CacheService.getScriptCache().remove('PERSONAL_SAVE_META_V1:' + id); } catch (ignore) {} }
}
/** Personal legacy save: task, category and retry receipt commit in one Sheets API batch. */
function savePersonalIssueBatch_(book, issue, current, snapshot, operationId, timing) {
  var mark = Date.now(), sheet = book.getSheetByName('Issues'), system = book.getSheetByName('_System');
  var row = current ? current._row : Math.max(2, sheet.getLastRow() + 1);
  var zone = book.getSpreadsheetTimeZone(), requests = [];
  function cell(value, kind) {
    if (value === '' || value == null) return { userEnteredValue: {} };
    if (kind === 'date') return { userEnteredValue: { numberValue: Date.parse(value + 'T00:00:00Z') / 86400000 + 25569 }, userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } };
    if (kind === 'timestamp') {
      var local = Utilities.formatDate(new Date(value), zone, "yyyy-MM-dd'T'HH:mm:ss.SSS");
      return { userEnteredValue: { numberValue: Date.parse(local + 'Z') / 86400000 + 25569 }, userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' } } };
    }
    return { userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } };
  }
  function write(target, targetRow, values) {
    if (targetRow > target.getMaxRows()) requests.push({ appendDimension: { sheetId: target.getSheetId(), dimension: 'ROWS', length: targetRow - target.getMaxRows() + 100 } });
    requests.push({ updateCells: { start: { sheetId: target.getSheetId(), rowIndex: targetRow - 1, columnIndex: 0 }, rows: [{ values: values }], fields: 'userEnteredValue' } });
    values.forEach(function (value, column) { if (value.userEnteredFormat) requests.push({ repeatCell: { range: { sheetId: target.getSheetId(), startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: column, endColumnIndex: column + 1 }, cell: { userEnteredFormat: value.userEnteredFormat }, fields: 'userEnteredFormat.numberFormat' } }); });
  }
  var taskCells = TrackerCore.fields.map(function (field) { return cell(issue[field.key], field.kind); });
  write(sheet, row, taskCells);
  var saved = clientIssue_(issue); saved.version = legacyIssueVersion_(saved);
  var nextSystemRow = Math.max(2, system.getLastRow() + 1);
  if ((snapshot.taskTypes[issue.id] || 'algo') !== issue.taskTypeId) {
    var typeKey = 'TASK_TYPE:' + issue.id;
    var typeIndex = snapshot.systemRows.findIndex(function (entry) { return String(entry[0]) === typeKey; });
    write(system, typeIndex >= 0 ? typeIndex + 2 : nextSystemRow++, [cell(typeKey), cell(issue.taskTypeId), cell(new Date().toISOString(), 'timestamp')]);
  }
  var receiptKey = 'IDEMPOTENCY:' + operationId;
  write(system, nextSystemRow, [cell(receiptKey), cell(JSON.stringify({ savedAt: new Date().toISOString(), result: saved })), cell(new Date().toISOString(), 'timestamp')]);
  // A request failure is never retried here: the browser retries the same operation ID.
  var response;
  try { response = Sheets.Spreadsheets.batchUpdate({ requests: requests, includeSpreadsheetInResponse: true, responseRanges: ["'Issues'!A" + row + ':U' + row], responseIncludeGridData: true }, book.getId()); }
  catch (error) { invalidatePersonalSaveMetadata_(book.getId()); throw error; }
  timing.writeMs = Date.now() - mark; mark = Date.now();
  var returnedSheet = response.updatedSpreadsheet && response.updatedSpreadsheet.sheets && response.updatedSpreadsheet.sheets.find(function (entry) { return entry.properties.sheetId === sheet.getSheetId(); });
  var data = returnedSheet && returnedSheet.data && returnedSheet.data[0];
  var values = data && data.rowData && data.rowData[0] && data.rowData[0].values || [];
  var matches = taskCells.every(function (expected, index) {
    var wanted = expected.userEnteredValue, actual = values[index] && values[index].effectiveValue || {};
    if (wanted.numberValue !== undefined) return actual.numberValue !== undefined && Math.abs(wanted.numberValue - actual.numberValue) < 0.000000001;
    if (wanted.stringValue !== undefined) return wanted.stringValue === actual.stringValue;
    return Object.keys(actual).length === 0;
  });
  if (!matches) throw new Error('The save response could not be verified. Retry this save with the same operation ID.');
  timing.verifyMs = Date.now() - mark; timing.journalMs = 0; timing.writer = 'sheets-batch';
  return saved;
}
/** Atomic server command for status, parent and rank changes across views. */
function moveIssue(id, move, expectedVersion, operationId) {
  return withLock_(function () {
    authorizationService_().require('write');
    var book = getBook_(), history = historyService_();
    operationId = operationId || move && move.operationId || '';
    var previousReceipt = history.findReceipt(book, operationId);
    if (previousReceipt) return clientIssue_(previousReceipt.result);
    var issues = readIssues_(book), current = issues.find(function (item) { return item.id === id; });
    if (!current) throw new Error('This issue no longer exists. Refresh the project.');
    if (current.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh before moving it.');
    move = move || {};
    var input = { id: current.id };
    ['status', 'parentId', 'rank'].forEach(function (key) { if (Object.prototype.hasOwnProperty.call(move, key)) input[key] = move[key]; });
    var issue = TrackerCore.prepare(input, current, today_(book), new Date().toISOString());
    TrackerCore.validate(issue, issues);
    writeIssue_(book, issue, current); SpreadsheetApp.flush();
    var saved = clientIssue_(readIssues_(book).find(function (item) { return item.id === id; }));
    var changedFields = ['status', 'parentId', 'rank'].filter(function (key) { return current[key] !== saved[key]; });
    history.record(book, { operationId: operationId, entityId: id, eventKind: 'moved', beforeRevision: current.version, afterRevision: saved.version, changedFields: changedFields, details: { source: 'app', move: true } });
    history.receipt(book, operationId, saved);
    return saved;
  });
}
function deleteIssue(id, expectedVersion) {
  return withLock_(function () {
    authorizationService_().require('write');
    var book = getBook_();
    var issues = readIssues_(book);
    var issue = issues.find(function (i) { return i.id === id; });
    if (!issue) throw new Error('This issue no longer exists. Refresh the project.');
    if (issue.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh before deleting.');
    TrackerCore.canDelete(id, issues);
    if (versionedRepositoryActive_(book)) archiveVersionedIssue_(book, issue);
    else book.getSheetByName('Issues').deleteRow(issue._row);
    SpreadsheetApp.flush();
    var archived = versionedRepositoryActive_(book), archivedIssue = archived ? readVersionedIssues_(book, true).find(function (item) { return item.id === id; }) : null;
    var result = { id: id, deleted: true, archived: archived, version: archivedIssue && archivedIssue.version || '' };
    historyService_().record(book, { entityId: id, eventKind: 'archived', beforeRevision: issue.version, afterRevision: archivedIssue && archivedIssue.version || '', changedFields: [], details: { source: 'app' } });
    return result;
  });
}
function restoreIssue(id, expectedVersion) {
  return withLock_(function () {
    authorizationService_().require('write');
    var book = getBook_();
    if (!versionedRepositoryActive_(book)) throw new Error('Restore is available after the versioned repository is activated.');
    var issue = readVersionedIssues_(book, true).find(function (item) { return item.id === id && item._archivedAt; });
    if (!issue) throw new Error('This archived issue no longer exists.');
    if (issue.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh before restoring.');
    restoreVersionedIssue_(book, issue);
    SpreadsheetApp.flush();
    var restored = clientIssue_(readIssues_(book).find(function (item) { return item.id === id; }));
    historyService_().record(book, { entityId: id, eventKind: 'restored', beforeRevision: issue.version, afterRevision: restored.version, changedFields: [], details: { source: 'app' } });
    return restored;
  });
}
function activateVersionedRepository() {
  return withLock_(function () {
    authorizationService_().require('configure');
    var book = getBook_();
    var schema = SheetFlowSchema.report(book);
    if (!schema.ready) throw new Error('Cannot activate v2 until every schema tab is ready. Run setupTracker, then check schema health.');
    var system = SheetFlowRepository.records(book, 'system');
    var migrationComplete = system.some(function (row) { return row.Key === 'MIGRATION_STATUS' && row.Value === 'complete'; });
    if (!migrationComplete) throw new Error('Run and review the legacy migration before activating the versioned repository.');
    var oldIssues = readIssues_(book), newIssues = readVersionedIssues_(book, false);
    var wasCutOver = getRepositoryProperty_('SHEETFLOW_V2_CUTOVER_DONE') === 'true';
    var rollbackDigest = getRepositoryProperty_('SHEETFLOW_ROLLBACK_DIGEST');
    if (wasCutOver && rollbackDigest && issueDataDigest_(oldIssues) !== rollbackDigest) throw new Error('V2 activation stopped: Issues changed after rollback. Reconcile those legacy edits before switching repositories.');
    if (!wasCutOver) {
      var oldIds = oldIssues.map(function (issue) { return issue.id; }).sort(), newIds = newIssues.map(function (issue) { return issue.id; }).sort();
      if (oldIds.join('|') !== newIds.join('|')) throw new Error('V2 activation stopped: migrated IDs do not match Issues. Run migrationDryRun and compare the migration targets.');
    }
    newIssues.forEach(function (issue) { TrackerCore.validate(issue, newIssues); });
    setRepositoryProperty_('SHEETFLOW_ACTIVE_SCHEMA', '2');
    setRepositoryProperty_('SHEETFLOW_V2_CUTOVER_DONE', 'true');
    deleteRepositoryProperty_('SHEETFLOW_ROLLBACK_DIGEST');
    return { activeRepository: 'v2', issueCount: newIssues.length, spreadsheetUrl: book.getUrl() };
  });
}
function deactivateVersionedRepository() {
  return withLock_(function () {
    authorizationService_().require('configure');
    var book = getBook_();
    if (!versionedRepositoryActive_(book)) return { activeRepository: 'legacy', issueCount: readIssues_(book).length, alreadyActive: true };
    var issues = readVersionedIssues_(book, false), sheet = book.getSheetByName('Issues');
    var oldCount = Math.max(0, sheet.getLastRow() - 1);
    if (oldCount) {
      var blankRows = Array.from({ length: oldCount }, function () { return Array(TrackerCore.fields.length).fill(''); });
      sheet.getRange(2, 1, oldCount, TrackerCore.fields.length).setValues(blankRows);
    }
    if (issues.length) {
      ensureRows_(sheet, issues.length + 1);
      sheet.getRange(2, 1, issues.length, TrackerCore.fields.length).setValues(issues.map(function (issue) { return toRow_(issue, book); }));
    }
    SpreadsheetApp.flush();
    var properties = PropertiesService.getScriptProperties();
    setRepositoryProperty_('SHEETFLOW_ACTIVE_SCHEMA', 'legacy');
    setRepositoryProperty_('SHEETFLOW_ROLLBACK_DIGEST', issueDataDigest_(issues));
    return { activeRepository: 'legacy', issueCount: issues.length, spreadsheetUrl: book.getUrl(), rollbackCopiedV2Changes: true };
  });
}
function loadSampleData() {
  return withLock_(function () {
    authorizationService_().require('configure');
    var book = getBook_();
    if (versionedRepositoryActive_(book)) {
      var currentV2 = readVersionedIssues_(book, false);
      if (currentV2.length) throw new Error('Sample data can only be added to an empty versioned repository.');
      var sampleIssues = TrackerCore.sample(today_(book));
      sampleIssues.forEach(function (issue) { writeIssue_(book, issue, null); });
      PropertiesService.getScriptProperties().setProperty('LAST_ISSUE_NUMBER', String(sampleIssues.length));
      SpreadsheetApp.flush();
      return { count: sampleIssues.length, spreadsheetUrl: book.getUrl() };
    }
    var sheet = book.getSheetByName('Issues');
    if (sheet.getLastRow() > 1) throw new Error('Sample data can only be added to an empty Issues sheet.');
    var issues = TrackerCore.sample(today_(book));
    ensureRows_(sheet, issues.length + 1);
    sheet.getRange(2, 1, issues.length, TrackerCore.fields.length).setValues(issues.map(function (i) { return toRow_(i, book); }));
    PropertiesService.getScriptProperties().setProperty('LAST_ISSUE_NUMBER', String(issues.length));
    SpreadsheetApp.flush();
    return { count: issues.length, spreadsheetUrl: book.getUrl() };
  });
}
/** Bound spreadsheets get IDs/defaults when users type or paste rows directly. */
function onEdit(e) {
  if (PropertiesService.getScriptProperties().getProperty('EDIT_TRIGGER_INSTALLED') !== 'true') handleSheetEdit(e);
}
function handleSheetEdit(e) {
  if (!e || !e.range || e.range.getLastRow() < 2) return;
  var eventSheet = e.range.getSheet(), eventName = eventSheet.getName();
  if (versionedRepositoryActive_(eventSheet.getParent()) && eventName !== 'Issues') {
    if (['Tasks', 'Projects and Epics'].indexOf(eventName) >= 0) return withLock_(function () { return handleVersionedSheetEdit_(e); });
    if (['Settings', 'Team', 'Holidays and Availability'].indexOf(eventName) >= 0) {
      var configured = false;
      try { if (typeof SheetFlowAuth !== 'undefined') { var email = e.user && e.user.getEmail ? e.user.getEmail() : ''; SheetFlowAuth.requireForEmail('configure', email); configured = true; } else configured = true; }
      catch (configurationError) { if (e.range.setNote) e.range.setNote('SheetFlow rejected this configuration edit: ' + configurationError.message); return; }
      if (configured && e.range.setNote) e.range.setNote('Configuration edits made directly in this tab are not yet validated by SheetFlow. Use the app settings operation and check this value.');
      return;
    }
    return;
  }
  if (eventName === 'Issues' && versionedRepositoryActive_(eventSheet.getParent())) {
    annotateRange_(e.range, 'Issues is the retained migration snapshot. Edit Tasks or Projects and Epics after v2 activation.');
    return;
  }
  if (eventName !== 'Issues') return;
  withLock_(function () {
    var sheet = e.range.getSheet();
    assertHeaders_(sheet);
    var book = sheet.getParent();
    if (typeof SheetFlowAuth !== 'undefined' && SheetFlowAuth.enforced()) {
      var editorEmail = '';
      try { editorEmail = e.user && e.user.getEmail ? e.user.getEmail() : ''; } catch (ignore) {}
      try { SheetFlowAuth.requireForEmail('write', editorEmail); }
      catch (authError) {
        var firstRow = Math.max(2, e.range.getRow());
        var lastRow = e.range.getLastRow();
        for (var deniedRow = firstRow; deniedRow <= lastRow; deniedRow++) {
          var deniedNote = sheet.getRange(deniedRow, 4);
          if (deniedNote.setNote) deniedNote.setNote('SheetFlow could not process this edit: ' + authError.message);
        }
        return;
      }
    }
    // Google supplies oldValue only for a single-cell edit. Use it to protect
    // generated identity/timestamp/order fields; bulk pastes are validated below.
    var editedRange = e.range, singleCell = editedRange.getNumRows && editedRange.getNumColumns && editedRange.getNumRows() === 1 && editedRange.getNumColumns() === 1;
    var editedColumn = editedRange.getColumn();
    if (singleCell && e.oldValue !== undefined && [1, 19, 20, 21].indexOf(editedColumn) >= 0) {
      editedRange.setValue(e.oldValue);
      if (editedRange.setNote) editedRange.setNote('This field is managed by SheetFlow and was restored.');
      return;
    }
    var existingRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TrackerCore.fields.length).getValues() : [];
    var taskTypes = typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.taskTypeMap(book) : {};
    var issues = existingRows.map(function (row, index) { return row.every(function (value) { return value === ''; }) ? null : issueFromRow_(row, index + 2, book, taskTypes); }).filter(Boolean);
    var start = Math.max(2, e.range.getRow());
    var count = e.range.getLastRow() - start + 1;
    var values = sheet.getRange(start, 1, count, TrackerCore.fields.length).getValues();
    var now = new Date();
    var validated = [], diagnostics = [];
    values.forEach(function (row, offset) {
      if (!String(row[3]).trim()) return;
      if (!row[0]) row[0] = nextId_(issues);
      if (!row[1]) row[1] = 'Task';
      if (!row[5]) row[5] = 'Backlog';
      if (!row[6]) row[6] = 'Medium';
      if (row[14] === '') row[14] = 0;
      if (row[18] === '') row[18] = now;
      row[19] = now;
      if (row[20] === '') row[20] = start + offset;
      if (row[5] === 'Done') { row[14] = 100; if (!row[11]) row[11] = Utilities.parseDate(today_(book), book.getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
      else if (e.range.getColumn() <= 6 && e.range.getLastColumn() >= 6) { row[11] = ''; if (row[14] === 100) row[14] = 0; }
      var rowNumber = start + offset, issue = issueFromRow_(row, rowNumber, book, taskTypes), message = '';
      if (issues.some(function (other) { return other.id && other.id === issue.id && other._row !== rowNumber; })) message = 'ID must be unique.';
      else {
        try { TrackerCore.validate(issue, issues.filter(function (other) { return other._row !== rowNumber; })); }
        catch (error) { message = error && error.message ? error.message : String(error); }
      }
      diagnostics.push({ row: rowNumber, message: message });
      if (!message) {
        var oldIndex = issues.findIndex(function (other) { return other._row === rowNumber; });
        if (oldIndex >= 0) issues[oldIndex] = issue; else issues.push(issue);
        validated.push(issue);
      }
    });
    // Persist the edited rectangle in one write. Validation errors leave the
    // entered values intact and are attached to the row for correction.
    sheet.getRange(start, 1, count, TrackerCore.fields.length).setValues(values);
    diagnostics.forEach(function (item) {
      var summary = sheet.getRange(item.row, 4);
      if (summary.setNote) summary.setNote(item.message ? 'SheetFlow validation: ' + item.message : '');
    });
    SpreadsheetApp.flush();
    validated.forEach(function (issue) {
      var firstColumn = e.range.getColumn(), lastColumn = e.range.getLastColumn();
      var changedFields = TrackerCore.fields.filter(function (field, index) { return index + 1 >= firstColumn && index + 1 <= lastColumn; }).map(function (field) { return field.key; });
      if (changedFields.indexOf('updatedAt') < 0) changedFields.push('updatedAt');
      historyService_().record(book, { entityId: issue.id, eventKind: 'direct_edit', actorId: editActorEmail_(e) || 'unknown', changedFields: changedFields, details: { source: 'sheet', row: issue._row } });
    });
  });
}
function handleVersionedSheetEdit_(e) {
  var sheet = e.range.getSheet(), book = sheet.getParent(), sheetName = sheet.getName();
  var editorEmail = '';
  try { editorEmail = e.user && e.user.getEmail ? e.user.getEmail() : ''; } catch (ignore) {}
  try { authorizationService_().requireForEmail('write', editorEmail); }
  catch (authError) { annotateRange_(e.range, 'SheetFlow could not process this edit: ' + authError.message); return; }
  var tab = sheetName === 'Tasks' ? 'tasks' : 'projects', headers = SheetFlowSchema.headers(tab);
  var actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (actualHeaders.join('|') !== headers.join('|')) throw new Error(sheetName + ' headers do not match schema ' + SheetFlowSchema.version + '.');
  var singleCell = e.range.getNumRows && e.range.getNumColumns && e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  var editedHeader = headers[e.range.getColumn() - 1];
  if (singleCell && e.oldValue !== undefined && ['ID', 'Revision', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Archived At', 'Archived By', 'Claimed By', 'Claimed At', 'Last Agent Activity'].indexOf(editedHeader) >= 0) {
    e.range.setValue(e.oldValue); annotateRange_(e.range, 'This field is managed by SheetFlow and was restored.'); return;
  }
  var start = Math.max(2, e.range.getRow()), count = e.range.getLastRow() - start + 1;
  var values = sheet.getRange(start, 1, count, headers.length).getValues();
  var allIssues;
  try { allIssues = readVersionedIssues_(book, false); }
  catch (loadError) { annotateRange_(e.range, 'SheetFlow could not reconcile this edit: ' + loadError.message); return; }
  var originalRows = new Map(allIssues.map(function (issue) { return [issue.id, issue]; }));
  var idRows = new Set(allIssues.map(function (issue) { return issue.id; })), valid = [], notes = [], now = new Date();
  var projectRecords = tab === 'tasks' ? [] : SheetFlowRepository.records(book, 'projects');
  var defaultTaskType = 'algo';
  if (typeof SheetFlowSettings !== 'undefined') {
    var defaultSetting = SheetFlowSettings.read(book).find(function (item) { return item.category === 'workflow' && item.key === 'defaultTaskType'; });
    if (defaultSetting && defaultSetting.value) defaultTaskType = String(defaultSetting.value).toLowerCase();
  }
  values.forEach(function (row, offset) {
    var titleIndex = headers.indexOf(tab === 'tasks' ? 'Title' : 'Title');
    if (!String(row[titleIndex] || '').trim()) return;
    var record = {}; headers.forEach(function (header, index) { record[header] = row[index]; });
    if (tab === 'tasks') {
      if (!record.ID) record.ID = nextId_(allIssues);
      if (!record.Kind) record.Kind = 'Task';
      if (!record['Task Type ID']) record['Task Type ID'] = defaultTaskType;
      if (!record['Project ID']) record['Project ID'] = (projectRecords.find(function (item) { return item['Entity Kind'] === 'Project'; }) || {}).ID || 'PROJECT-1';
      if (!record.Status) record.Status = 'Backlog';
      if (!record.Priority) record.Priority = 'Medium';
      if (record['Estimate (h)'] === '') record['Estimate (h)'] = 0;
      if (record['Time Spent (h)'] === '') record['Time Spent (h)'] = 0;
      if (record['Progress (%)'] === '') record['Progress (%)'] = 0;
      if (!record['Created At']) record['Created At'] = now;
      record['Updated At'] = now;
      if (!record.Revision) record.Revision = 1;
      if (!record.Order) record.Order = (allIssues.length + offset + 1) * 1000;
      if (!record['Legacy JSON']) record['Legacy JSON'] = JSON.stringify({ type: record.Kind === 'Story' ? 'Story' : 'Task', status: record.Status === 'Ready' ? 'To Do' : record.Status, priority: record.Priority, rank: Number(record.Order) || 0 });
    } else {
      if (String(record['Entity Kind']) !== 'Epic') {
        notes.push({ row: start + offset, message: 'Create or edit Epic records here. Project management is not yet supported.' });
        return;
      }
      if (!record.ID) record.ID = nextId_(allIssues);
      if (!record['Project ID']) record['Project ID'] = (projectRecords.find(function (item) { return item['Entity Kind'] === 'Project'; }) || {}).ID || 'PROJECT-1';
      if (record.Active === '' || record.Active == null) record.Active = true;
      if (!record.Revision) record.Revision = 1;
      if (!record.Order) record.Order = (allIssues.length + offset + 1) * 1000;
      if (!record['Legacy JSON']) record['Legacy JSON'] = JSON.stringify({ type: 'Epic', status: 'Backlog', priority: 'Medium', rank: Number(record.Order) || 0 });
    }
    var legacyState = {};
    try { legacyState = JSON.parse(String(record['Legacy JSON'] || '{}')); } catch (ignore) {}
    var managed = legacyState.__sheetflow || {}, managedRestore = false, managedMessage = '';
    var knownId = String(managed.id || legacyState.id || '');
    if (knownId && String(record.ID || '') !== knownId) { record.ID = knownId; managedRestore = true; managedMessage = 'ID is managed by SheetFlow and was restored.'; }
    if (managed.revision != null && Number(record.Revision) !== Number(managed.revision)) { record.Revision = Number(managed.revision); managedRestore = true; managedMessage = 'Revision is managed by SheetFlow and was restored.'; }
    if (tab === 'tasks' && managed.createdAt && comparableTimestamp_(record['Created At']) !== String(managed.createdAt)) { record['Created At'] = new Date(managed.createdAt); managedRestore = true; managedMessage = 'Created At is managed by SheetFlow and was restored.'; }
    if (tab === 'projects' && managed.active != null && Boolean(record.Active) !== Boolean(managed.active)) { record.Active = Boolean(managed.active); managedRestore = true; managedMessage = 'Active state is managed by SheetFlow and was restored.'; }
    var issue = versionedRecordToIssue_(record, book, tab);
    var message = managedMessage, rowNumber = start + offset;
    var sameRow = allIssues.find(function (item) { return item._row === rowNumber && item._storageTab === tab; });
    if (!message && (!issue.id || (idRows.has(issue.id) && (!sameRow || sameRow.id !== issue.id)))) message = 'ID must be unique.';
    else if (!message) {
      try {
        validateVersionedMembership_(record, issue, allIssues);
        TrackerCore.validate(issue, allIssues.filter(function (other) { return other.id !== issue.id; }));
      } catch (error) { message = error && error.message ? error.message : String(error); }
    }
    if (tab === 'tasks' && record.Kind !== 'Story' && record.Kind !== 'Task' && record.Kind !== 'Subtask') message = 'Kind must be Story, Task, or Subtask.';
    notes.push({ row: start + offset, message: message });
    if (message && managedRestore) values[offset] = headers.map(function (header) { return record[header] == null ? '' : record[header]; });
    if (!message) {
      var isUpdate = Boolean(sameRow && sameRow.id === issue.id);
      record.Revision = isUpdate ? (Number(record.Revision) || 0) + 1 : Math.max(1, Number(record.Revision) || 1);
      legacyState.__sheetflow = managedMetadata_(record, tab, legacyState);
      record['Legacy JSON'] = JSON.stringify(legacyState);
      values[offset] = headers.map(function (header) { return record[header] == null ? '' : record[header]; });
      var old = isUpdate ? sameRow : null, oldIndex = sameRow ? allIssues.indexOf(sameRow) : -1;
      issue._row = start + offset;
      if (oldIndex >= 0) allIssues[oldIndex] = issue; else allIssues.push(issue);
      var firstColumn = e.range.getColumn(), lastColumn = e.range.getLastColumn();
      var changedFields = headers.filter(function (_, index) { return index + 1 >= firstColumn && index + 1 <= lastColumn; });
      valid.push({ id: issue.id, before: old, record: record, tab: tab, row: start + offset, changedFields: changedFields });
    }
  });
  sheet.getRange(start, 1, count, headers.length).setValues(values);
  notes.forEach(function (item) { annotateRange_(sheet.getRange(item.row, headers.indexOf('Title') + 1), item.message ? 'SheetFlow validation: ' + item.message : ''); });
  SpreadsheetApp.flush();
  valid.forEach(function (entry) {
    var source = entry.tab === 'tasks' ? 'Tasks' : 'Projects and Epics';
    historyService_().record(book, { entityId: entry.id, eventKind: 'direct_edit', actorId: editActorEmail_(e) || 'unknown', changedFields: entry.changedFields, details: { source: source, row: entry.row } });
  });
}
function validateVersionedMembership_(record, issue, issues) {
  var byId = new Map(issues.map(function (item) { return [item.id, item]; }));
  var parent = issue.parentId ? byId.get(issue.parentId) : null;
  if (issue.parentId && !parent) throw new Error('Parent ID must reference an existing active item.');
  var expectedEpic = parent && parent.type === 'Epic' ? parent.id : '';
  var ancestor = parent, seen = {};
  while (ancestor && ancestor.type !== 'Epic' && ancestor.parentId && !seen[ancestor.id]) { seen[ancestor.id] = true; ancestor = byId.get(ancestor.parentId); }
  if (!expectedEpic && ancestor && ancestor.type === 'Epic') expectedEpic = ancestor.id;
  if (String(record['Epic ID'] || '') !== expectedEpic) throw new Error("Epic ID must match the item's Epic ancestor.");
  if (record['Parent Task ID'] && parent && parent.type === 'Epic') throw new Error('Use Epic ID for a direct Epic child; Parent Task ID must reference a Story or Task.');
}
function annotateRange_(range, message) { if (range && range.setNote) range.setNote(message); }
function editActorEmail_(e) { try { return e && e.user && e.user.getEmail ? String(e.user.getEmail() || '') : ''; } catch (ignore) { return ''; } }
function comparableTimestamp_(value) { return value instanceof Date ? value.toISOString() : String(value || ''); }
function issueFromRow_(row, rowNumber, book, taskTypes) {
  var issue = {};
  TrackerCore.fields.forEach(function (field, index) {
    var value = row[index];
    if (value instanceof Date) value = field.kind === 'date' ? Utilities.formatDate(value, book.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : value.toISOString();
    if (field.kind === 'number') value = value === '' ? 0 : Number(value); else value = String(value == null ? '' : value);
    issue[field.key] = value;
  });
  issue.taskTypeId = taskTypes[issue.id] || 'algo';
  issue._row = rowNumber;
  return issue;
}
function getBook_() {
  var id = environmentSpreadsheetId_();
  if (!id) throw new Error('Run setupTracker in the Apps Script editor first.');
  var book = SpreadsheetApp.openById(id);
  var sheet = book.getSheetByName('Issues');
  if (!sheet) throw new Error('The Issues sheet is missing. Run setupTracker.');
  assertHeaders_(sheet);
  return book;
}
function environmentSpreadsheetId_() {
  return typeof SheetFlowEnvironment !== 'undefined' ? SheetFlowEnvironment.spreadsheetId() : PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}
/** Plain browser data: Dates become ISO strings before crossing google.script.run. */
function browserValue_(value) { return JSON.parse(JSON.stringify(value)); }
/** Fresh per-save operational snapshot. Never retained across requests. */
function readSystemRows_(book) {
  var sheet = book.getSheetByName('_System');
  return sheet && sheet.getName() === '_System' && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
}
function legacyIssueVersion_(issue) {
  var values = {};
  TrackerCore.fields.forEach(function (field) { values[field.key] = issue[field.key]; });
  values.taskTypeId = issue.taskTypeId;
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(values)));
}
/** Verify authoritative stored values without reloading the whole register. */
function readWrittenIssue_(book, location, issue) {
  var saved;
  if (location.tab === 'Issues') {
    var row = book.getSheetByName('Issues').getRange(location.row, 1, 1, TrackerCore.fields.length).getValues()[0], types = {};
    types[issue.id] = location.taskTypeId || 'algo';
    saved = issueFromRow_(row, location.row, book, types); saved.version = legacyIssueVersion_(saved);
  } else {
    var def = SheetFlowSchema.tabs[location.tab], values = book.getSheetByName(def.name).getRange(location.row, 1, 1, def.headers.length).getValues()[0];
    var record = { _row: location.row };
    def.headers.forEach(function (header, index) { record[header] = values[index]; });
    saved = versionedRecordToIssue_(record, book, location.tab);
  }
  if (saved.id !== issue.id) throw new Error('The saved row moved during this operation. Refresh and review the project before retrying.');
  return saved;
}
/** Keep storage metadata and raw Sheet records on the server. */
function clientIssue_(issue) {
  var result = {};
  TrackerCore.fields.forEach(function (field) { result[field.key] = issue[field.key]; });
  result.taskTypeId = issue.taskTypeId; result.version = issue.version;
  return browserValue_(result);
}
function historyService_() {
  if (typeof SheetFlowHistory !== 'undefined') return SheetFlowHistory;
  return { findReceipt: function () { return null; }, record: function () {}, receipt: function () {} };
}
function authorizationService_() {
  if (typeof SheetFlowAuth !== 'undefined') return SheetFlowAuth;
  return { require: function () { return { id: 'test', role: 'administrator' }; }, requireForEmail: function () { return { id: 'test', role: 'administrator' }; } };
}
function assertHeaders_(sheet) {
  var actual = sheet.getRange(1, 1, 1, TrackerCore.fields.length).getValues()[0];
  if (actual.join('|') !== TrackerCore.fields.map(function (f) { return f.label; }).join('|')) throw new Error('Issues has different column headers. Keep the documented columns in their original order, or rename the existing tab before setup.');
}
function versionedRepositoryActive_(book, systemRows) {
  var active = getRepositoryProperty_('SHEETFLOW_ACTIVE_SCHEMA') === '2';
  if (active && typeof SheetFlowSchema !== 'undefined' && !SheetFlowSchema.report(book, systemRows).ready) throw new Error('The versioned repository is active, but its schema is incomplete. Run setupTracker and repair the schema before continuing.');
  return active;
}
function repositoryPropertyKey_(base) {
  var environment = typeof SheetFlowEnvironment !== 'undefined' ? SheetFlowEnvironment.currentName() : '';
  return environment ? base + '_' + String(environment).toUpperCase() : base;
}
function getRepositoryProperty_(base) { return PropertiesService.getScriptProperties().getProperty(repositoryPropertyKey_(base)) || ''; }
function setRepositoryProperty_(base, value) { PropertiesService.getScriptProperties().setProperty(repositoryPropertyKey_(base), String(value)); }
function deleteRepositoryProperty_(base) { PropertiesService.getScriptProperties().deleteProperty(repositoryPropertyKey_(base)); }
function writeIssue_(book, issue, current, snapshot) {
  if (!(snapshot ? snapshot.versioned : versionedRepositoryActive_(book))) {
    var legacySheet = book.getSheetByName('Issues'), legacyRow = current ? current._row : Math.max(2, legacySheet.getLastRow() + 1);
    ensureRows_(legacySheet, legacyRow);
    legacySheet.getRange(legacyRow, 1, 1, TrackerCore.fields.length).setValues([toRow_(issue, book)]);
    return { tab: 'Issues', row: legacyRow };
  }
  if (typeof SheetFlowRepository === 'undefined') throw new Error('Repository.js is missing. Push the complete Apps Script source before activating schema v2.');
  var issueFields = {};
  TrackerCore.fields.forEach(function (field) { issueFields[field.key] = issue[field.key]; });
  var legacy = current && current._legacyData ? Object.assign({}, current._legacyData) : {};
  Object.keys(issueFields).forEach(function (key) { legacy[key] = issueFields[key]; });
  var legacyJson, revision = Number(current && current._storageRevision) || 0;
  var projects = snapshot ? snapshot.projects : SheetFlowRepository.records(book, 'projects');
  if (issue.type === 'Epic') {
    var projectRecord = Object.assign({}, projects.find(function (item) { return String(item.ID) === issue.id; }) || {});
    projectRecord.ID = issue.id; projectRecord['Entity Kind'] = 'Epic';
    projectRecord['Project ID'] = projectRecord['Project ID'] || (projects.find(function (item) { return item['Entity Kind'] === 'Project'; }) || {}).ID || 'PROJECT-1';
    projectRecord.Title = issue.summary; projectRecord.Description = issue.description || '';
    projectRecord['Owner ID'] = issue.assignee || ''; projectRecord['Start Date'] = appDateToSheet_(issue.startDate, book);
    projectRecord['Due Date'] = appDateToSheet_(issue.dueDate, book); projectRecord.Order = issue.rank;
    projectRecord.Active = true; projectRecord['Archived At'] = ''; projectRecord.Revision = revision + 1;
    legacy.__sheetflow = managedMetadata_(projectRecord, 'projects', legacy); legacyJson = JSON.stringify(legacy); projectRecord['Legacy JSON'] = legacyJson;
    return { tab: 'projects', row: SheetFlowRepository.upsert(book, 'projects', projectRecord, projects)._row };
  }
  var taskRecords = snapshot ? snapshot.tasks : SheetFlowRepository.records(book, 'tasks');
  var taskRecord = Object.assign({}, taskRecords.find(function (item) { return String(item.ID) === issue.id; }) || {});
  var allIssues = snapshot ? snapshot.issues : (current ? readVersionedIssues_(book, true) : readVersionedIssues_(book, false));
  var parents = new Map(allIssues.map(function (item) { return [item.id, item]; }));
  var parent = parents.get(issue.parentId), parentTaskId = parent && parent.type !== 'Epic' ? parent.id : '';
  var epicId = parent && parent.type === 'Epic' ? parent.id : '';
  var ancestor = parent, seen = {};
  while (ancestor && ancestor.type !== 'Epic' && ancestor.parentId && !seen[ancestor.id]) {
    seen[ancestor.id] = true; ancestor = parents.get(ancestor.parentId);
  }
  if (!epicId && ancestor && ancestor.type === 'Epic') epicId = ancestor.id;
  var epicRecord = epicId ? projects.find(function (item) { return String(item.ID) === epicId; }) : null;
  taskRecord.ID = issue.id; taskRecord.Kind = issue.type === 'Story' ? 'Story' : (taskRecord.Kind === 'Subtask' ? 'Subtask' : 'Task');
  taskRecord['Task Type ID'] = issue.taskTypeId || 'algo'; taskRecord['Project ID'] = epicRecord && epicRecord['Project ID'] || (projects.find(function (item) { return item['Entity Kind'] === 'Project'; }) || {}).ID || 'PROJECT-1';
  taskRecord['Epic ID'] = epicId; taskRecord['Parent Task ID'] = parentTaskId; taskRecord.Title = issue.summary; taskRecord.Description = issue.description || '';
  taskRecord['Acceptance Criteria'] = taskRecord['Acceptance Criteria'] || ''; taskRecord.Status = issue.status === 'To Do' ? 'Ready' : issue.status;
  taskRecord.Priority = issue.priority; taskRecord['Assignee ID'] = issue.assignee; taskRecord.Reporter = issue.reporter;
  taskRecord['Start Date'] = appDateToSheet_(issue.startDate, book); taskRecord['Due Date'] = appDateToSheet_(issue.dueDate, book);
  taskRecord['Completed Date'] = appDateToSheet_(issue.completedDate, book); taskRecord['Estimate (h)'] = issue.estimate; taskRecord['Time Spent (h)'] = issue.timeSpent;
  taskRecord['Progress (%)'] = issue.progress; taskRecord.Tags = issue.labels; taskRecord.Sprint = issue.sprint; taskRecord.Dependencies = issue.dependencies;
  taskRecord['Created At'] = appTimestampToSheet_(issue.createdAt); taskRecord['Updated At'] = appTimestampToSheet_(issue.updatedAt);
  taskRecord.Revision = revision + 1; taskRecord['Archived At'] = ''; taskRecord.Order = issue.rank;
  legacy.__sheetflow = managedMetadata_(taskRecord, 'tasks'); legacyJson = JSON.stringify(legacy); taskRecord['Legacy JSON'] = legacyJson;
  return { tab: 'tasks', row: SheetFlowRepository.upsert(book, 'tasks', taskRecord, taskRecords)._row };
}
function readVersionedIssues_(book, includeArchived, snapshot) {
  if (typeof SheetFlowRepository === 'undefined') throw new Error('Repository.js is missing. Push the complete Apps Script source before activating schema v2.');
  var tasks = snapshot ? snapshot.tasks : SheetFlowRepository.records(book, 'tasks'), projects = snapshot ? snapshot.projects : SheetFlowRepository.records(book, 'projects'), issues = [];
  tasks.forEach(function (record) { if (includeArchived || !record['Archived At']) issues.push(versionedRecordToIssue_(record, book, 'tasks')); });
  projects.forEach(function (record) {
    if (String(record['Entity Kind']) !== 'Epic' || (!includeArchived && (record.Active === false || record['Archived At']))) return;
    issues.push(versionedRecordToIssue_(record, book, 'projects'));
  });
  var seen = {};
  issues.forEach(function (issue) { if (seen[issue.id]) throw new Error('Duplicate ID ' + issue.id + ' in the versioned repository. Each ID must be unique.'); seen[issue.id] = true; });
  return TrackerCore.sorted(issues);
}
function versionedRecordToIssue_(record, book, tab) {
  var issue = TrackerCore.blank(), legacy = {};
  try { legacy = JSON.parse(String(record['Legacy JSON'] || '{}')); } catch (ignore) {}
  Object.keys(legacy).forEach(function (key) { if (key !== '__sheetflow') issue[key] = legacy[key]; });
  var epic = tab === 'projects';
  issue.id = String(record.ID || ''); issue.type = epic ? 'Epic' : record.Kind === 'Story' ? 'Story' : (legacy.type === 'Bug' ? 'Bug' : 'Task');
  issue.summary = String(epic ? record.Title || '' : record.Title || ''); issue.description = String(record.Description || '');
  issue.parentId = epic ? '' : String(record['Parent Task ID'] || record['Epic ID'] || '');
  issue.taskTypeId = epic ? String(legacy.taskTypeId || 'algo') : String(record['Task Type ID'] || legacy.taskTypeId || 'algo');
  issue.assignee = String(epic ? record['Owner ID'] || '' : record['Assignee ID'] || '');
  if (!epic) {
    issue.reporter = String(record.Reporter || ''); issue.status = record.Status === 'Ready' ? 'To Do' : String(record.Status || 'Backlog');
    issue.priority = String(record.Priority || 'Medium'); issue.completedDate = schemaDateToApp_(record['Completed Date'], book);
    issue.estimate = Number(record['Estimate (h)'] || 0); issue.timeSpent = Number(record['Time Spent (h)'] || 0); issue.progress = Number(record['Progress (%)'] || 0);
    issue.labels = String(record.Tags || ''); issue.sprint = String(record.Sprint || ''); issue.dependencies = String(record.Dependencies || '');
  }
  issue.startDate = schemaDateToApp_(record['Start Date'], book); issue.dueDate = schemaDateToApp_(record['Due Date'], book);
  issue.createdAt = schemaTimestampToApp_(record['Created At'] || issue.createdAt); issue.updatedAt = schemaTimestampToApp_(record['Updated At'] || issue.updatedAt);
  issue.rank = Number(record.Order || 0); issue.version = repositoryVersion_(record); issue._row = record._row; issue._storageTab = tab;
  issue._storageRevision = Number(record.Revision) || 0; issue._legacyData = legacy;
  issue._archivedAt = record['Archived At'] || ''; issue._record = record;
  return issue;
}
function archiveVersionedIssue_(book, issue) {
  var record = Object.assign({}, issue._record || {}), archivedAt = new Date();
  record['Archived At'] = archivedAt; record['Archived By'] = (typeof SheetFlowAuth !== 'undefined' ? SheetFlowAuth.actor().id : 'unknown'); record.Active = false; record.Revision = (Number(record.Revision) || 0) + 1;
  var legacy = {}; try { legacy = JSON.parse(String(record['Legacy JSON'] || '{}')); } catch (ignore) {}
  legacy.__sheetflow = managedMetadata_(record, issue._storageTab, legacy); record['Legacy JSON'] = JSON.stringify(legacy);
  SheetFlowRepository.upsert(book, issue._storageTab, record);
}
function restoreVersionedIssue_(book, issue) {
  var record = Object.assign({}, issue._record || {}); record['Archived At'] = ''; record['Archived By'] = ''; record.Active = true; record.Revision = (Number(record.Revision) || 0) + 1;
  var legacy = {}; try { legacy = JSON.parse(String(record['Legacy JSON'] || '{}')); } catch (ignore) {}
  legacy.__sheetflow = managedMetadata_(record, issue._storageTab, legacy); record['Legacy JSON'] = JSON.stringify(legacy);
  SheetFlowRepository.upsert(book, issue._storageTab, record);
}
function appDateToSheet_(value, book) { return value ? Utilities.parseDate(String(value), book.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : ''; }
function schemaDateToApp_(value, book) { return value instanceof Date ? Utilities.formatDate(value, book.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(value || '').slice(0, 10); }
function appTimestampToSheet_(value) { return value ? new Date(value) : ''; }
function schemaTimestampToApp_(value) { return value instanceof Date ? value.toISOString() : String(value || ''); }
function repositoryVersion_(record) {
  var source = {}; Object.keys(record).forEach(function (key) { if (key !== '_row') source[key] = record[key]; });
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(source)));
}
function issueDataDigest_(issues) {
  var rows = TrackerCore.sorted(issues).map(function (issue) { return TrackerCore.fields.map(function (field) { return issue[field.key] == null ? '' : issue[field.key]; }); });
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(rows)));
}
function managedMetadata_(record, tab, legacy) {
  function stamp(value) { return value instanceof Date ? value.toISOString() : String(value || ''); }
  return {
    id: String(record.ID || ''), revision: Number(record.Revision) || 0,
    createdAt: stamp(tab === 'tasks' ? record['Created At'] : legacy && legacy.createdAt),
    createdBy: String(tab === 'tasks' ? record['Created By'] || '' : ''),
    archivedAt: stamp(record['Archived At']), archivedBy: String(record['Archived By'] || ''),
    claimedBy: String(record['Claimed By'] || ''), claimedAt: stamp(record['Claimed At']),
    updatedBy: String(record['Updated By'] || ''), lastAgentActivity: stamp(record['Last Agent Activity']),
    active: tab === 'projects' ? record.Active !== false : null
  };
}
function readIssues_(book, snapshot) {
  if (snapshot ? snapshot.versioned : versionedRepositoryActive_(book)) return readVersionedIssues_(book, false, snapshot);
  var sheet = book.getSheetByName('Issues');
  if (sheet.getLastRow() < 2) return [];
  var seen = {};
  var taskTypes = snapshot ? snapshot.taskTypes : (typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.taskTypeMap(book) : {});
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, TrackerCore.fields.length).getValues().map(function (row, index) {
    if (row.every(function (v) { return v === ''; })) return null;
    if (!row[0] || !row[3]) throw new Error('Row ' + (index + 2) + ' needs an ID and Summary. Edit the Summary cell in Sheets to generate an ID.');
    var issue = {};
    TrackerCore.fields.forEach(function (f, n) {
      var v = row[n];
      if (v instanceof Date) v = f.kind === 'date' ? Utilities.formatDate(v, book.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : v.toISOString();
      if (f.kind === 'number') v = v === '' ? 0 : Number(v); else v = String(v);
      issue[f.key] = v;
    });
    if (seen[issue.id]) throw new Error('Duplicate ID ' + issue.id + ' in Issues. Each ID must be unique.');
    seen[issue.id] = true;
    if (TrackerCore.statuses.indexOf(issue.status) < 0 || TrackerCore.types.indexOf(issue.type) < 0) throw new Error('Row ' + (index + 2) + ' has an invalid Type or Status. Correct it in Sheets.');
    issue.taskTypeId = taskTypes[issue.id] || 'algo';
    issue.version = legacyIssueVersion_(issue);
    issue._row = index + 2;
    return issue;
  }).filter(Boolean);
}
function toRow_(issue, book) {
  return TrackerCore.fields.map(function (f) {
    var value = issue[f.key];
    if (value === '' || value == null) return '';
    if (f.kind === 'date') return Utilities.parseDate(value, book.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    if (f.kind === 'timestamp') return new Date(value);
    if (typeof value === 'string' && /^\s*[=+@-]/.test(value)) return "'" + value;
    return value;
  });
}
function nextId_(issues) {
  var properties = PropertiesService.getScriptProperties();
  var highest = Math.max(Number(properties.getProperty('LAST_ISSUE_NUMBER')) || 0, 0);
  issues.forEach(function (i) { var m = /^PRJ-(\d+)$/.exec(i.id); if (m) highest = Math.max(highest, Number(m[1])); });
  properties.setProperty('LAST_ISSUE_NUMBER', String(highest + 1));
  return 'PRJ-' + (highest + 1);
}
function today_(book) { return Utilities.formatDate(new Date(), book.getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
function withLock_(fn) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function ensureRows_(sheet, row) {
  if (row > sheet.getMaxRows()) { sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, row - sheet.getMaxRows())); formatSheet_(sheet); }
}
function formatSheet_(sheet) {
  var fields = TrackerCore.fields;
  if (sheet.getMaxColumns() < fields.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), fields.length - sheet.getMaxColumns());
  if (sheet.getMaxRows() < 1000) sheet.insertRowsAfter(sheet.getMaxRows(), 1000 - sheet.getMaxRows());
  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(1, 1, 1, fields.length).setValues([fields.map(function (f) { return f.label; })]).setBackground('#173e36').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  // Frozen-pane setters return void in Apps Script and cannot be chained.
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.setRowHeight(1, 40);
  sheet.getRange(2, 1, rows, fields.length).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  fields.forEach(function (f, index) {
    var range = sheet.getRange(2, index + 1, rows, 1);
    sheet.setColumnWidth(index + 1, f.key === 'summary' ? 320 : f.key === 'description' ? 380 : 145);
    if (f.kind === 'date') range.setNumberFormat('yyyy-mm-dd').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
    if (f.kind === 'timestamp') range.setNumberFormat('yyyy-mm-dd hh:mm');
    if (f.kind === 'number') range.setNumberFormat('0.##').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
  });
  [[2, TrackerCore.types], [6, TrackerCore.statuses], [7, TrackerCore.priorities]].forEach(function (pair) {
    sheet.getRange(2, pair[0], rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(pair[1], true).setAllowInvalid(false).build());
  });
  sheet.getRange(2, 15, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 100).setAllowInvalid(false).build());
  var filter = sheet.getFilter(); if (filter) filter.remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), fields.length).createFilter();
  var rules = TrackerCore.statuses.map(function (status, index) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(status).setBackground(['#edf0f3', '#e9edff', '#e5f2ff', '#fff2d7', '#dff1e8'][index]).setRanges([sheet.getRange(2, 6, rows, 1)]).build();
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($K2<>"",$K2<TODAY(),$F2<>"Done")').setBackground('#fbe6e5').setFontColor('#a52d2d').setRanges([sheet.getRange(2, 11, rows, 1)]).build());
  sheet.setConditionalFormatRules(rules);
}
