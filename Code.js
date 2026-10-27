/** Google Sheets storage and web-app entry points. Run setupTracker once. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SheetFlow')
    .addItem('Set up / repair tracker', 'setupTracker')
    .addItem('Open tracker', 'openTracker')
    .addItem('Check schema health', 'schemaHealthCheck')
    .addItem('Run startup health check', 'startupHealthCheck')
    .addItem('Preview v2 migration', 'migrationDryRun')
    .addItem('Migrate legacy Issues to v2 tabs', 'migrateLegacyIssues')
    .addItem('Add sample project to empty tracker', 'loadSampleData').addToUi();
}

function setupTracker() {
  return withLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var id = SheetFlowEnvironment.spreadsheetId();
    var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!book) book = SpreadsheetApp.create('SheetFlow — Project tracker');
    var sheet = book.getSheetByName('Issues');
    if (!sheet) sheet = book.insertSheet('Issues');
    if (sheet.getLastRow() > 0) assertHeaders_(sheet);
    properties.setProperty('SPREADSHEET_ID', book.getId());
    properties.setProperty('SHEETFLOW_SPREADSHEET_ID_' + SheetFlowEnvironment.config().name.toUpperCase(), book.getId());
    formatSheet_(sheet);
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
function getProject() {
  return withLock_(function () {
    var book = getBook_();
    return { issues: readIssues_(book), spreadsheetUrl: book.getUrl(), name: book.getName(), serverTime: new Date().toISOString() };
  });
}
/** expectedVersion prevents an old browser tab overwriting a newer row. */
function saveIssue(input, expectedVersion) {
  return withLock_(function () {
    var book = getBook_();
    var issues = readIssues_(book);
    var current = input.id ? issues.find(function (i) { return i.id === input.id; }) : null;
    if (input.id && !current) throw new Error('This issue no longer exists. Refresh the project.');
    if (current && current.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh, then apply your changes again.');
    var issue = TrackerCore.prepare(input, current, today_(book), new Date().toISOString());
    if (!current) issue.id = nextId_(issues);
    TrackerCore.validate(issue, issues);
    var sheet = book.getSheetByName('Issues');
    var row = current ? current._row : Math.max(2, sheet.getLastRow() + 1);
    ensureRows_(sheet, row);
    sheet.getRange(row, 1, 1, TrackerCore.fields.length).setValues([toRow_(issue, book)]);
    SpreadsheetApp.flush();
    return readIssues_(book).find(function (i) { return i.id === issue.id; });
  });
}
function deleteIssue(id, expectedVersion) {
  return withLock_(function () {
    var book = getBook_();
    var issues = readIssues_(book);
    var issue = issues.find(function (i) { return i.id === id; });
    if (!issue) throw new Error('This issue no longer exists. Refresh the project.');
    if (issue.version !== expectedVersion) throw new Error('This issue changed elsewhere. Refresh before deleting.');
    TrackerCore.canDelete(id, issues);
    book.getSheetByName('Issues').deleteRow(issue._row);
    SpreadsheetApp.flush();
    return { id: id };
  });
}
function loadSampleData() {
  return withLock_(function () {
    var book = getBook_();
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
  if (!e || !e.range || e.range.getSheet().getName() !== 'Issues' || e.range.getLastRow() < 2) return;
  withLock_(function () {
    var sheet = e.range.getSheet();
    assertHeaders_(sheet);
    var book = sheet.getParent();
    // New rows may not have IDs yet; scan only IDs when allocating numbers.
    var issues = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return { id: String(r[0]) }; }) : [];
    var start = Math.max(2, e.range.getRow());
    var count = e.range.getLastRow() - start + 1;
    var values = sheet.getRange(start, 1, count, TrackerCore.fields.length).getValues();
    var now = new Date();
    values.forEach(function (row, offset) {
      if (!String(row[3]).trim()) return;
      function set(col, value) { sheet.getRange(start + offset, col).setValue(value); }
      if (!row[0]) { var id = nextId_(issues); set(1, id); issues.push({ id: id }); }
      if (!row[1]) set(2, 'Task');
      if (!row[5]) set(6, 'Backlog');
      if (!row[6]) set(7, 'Medium');
      if (row[14] === '') set(15, 0);
      if (row[18] === '') set(19, now);
      set(20, now);
      if (row[20] === '') set(21, start + offset);
      if (row[5] === 'Done') { set(15, 100); if (!row[11]) set(12, Utilities.parseDate(today_(book), book.getSpreadsheetTimeZone(), 'yyyy-MM-dd')); }
      else if (e.range.getColumn() <= 6 && e.range.getLastColumn() >= 6) { set(12, ''); if (row[14] === 100) set(15, 0); }
    });
    SpreadsheetApp.flush();
  });
}
function getBook_() {
  var id = SheetFlowEnvironment.spreadsheetId();
  if (!id) throw new Error('Run setupTracker in the Apps Script editor first.');
  var book = SpreadsheetApp.openById(id);
  var sheet = book.getSheetByName('Issues');
  if (!sheet) throw new Error('The Issues sheet is missing. Run setupTracker.');
  assertHeaders_(sheet);
  return book;
}
function assertHeaders_(sheet) {
  var actual = sheet.getRange(1, 1, 1, TrackerCore.fields.length).getValues()[0];
  if (actual.join('|') !== TrackerCore.fields.map(function (f) { return f.label; }).join('|')) throw new Error('Issues has different column headers. Keep the documented columns in their original order, or rename the existing tab before setup.');
}
function readIssues_(book) {
  var sheet = book.getSheetByName('Issues');
  if (sheet.getLastRow() < 2) return [];
  var seen = {};
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
    issue.version = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(issue)));
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
