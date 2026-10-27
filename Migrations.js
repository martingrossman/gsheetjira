/** Non-destructive legacy Issues -> versioned workbook migration. */
function ensureSchemaTabs_(book) {
  Object.keys(SheetFlowSchema.tabs).forEach(function (key) {
    var definition = SheetFlowSchema.tabs[key];
    var sheet = book.getSheetByName(definition.name) || book.insertSheet(definition.name);
    var current = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, definition.headers.length).getValues()[0] : [];
    if (!current.length || current.every(function (value) { return value === ''; })) {
      sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
      sheet.setFrozenRows(1);
    } else if (current.join('|') !== definition.headers.join('|')) {
      throw new Error(definition.name + ' has unexpected headers. Rename it or repair it before migration.');
    }
  });
  var system = book.getSheetByName(SheetFlowSchema.tabs.system.name);
  var systemRows = system.getLastRow() > 1 ? system.getRange(2, 1, system.getLastRow() - 1, 2).getValues() : [];
  var hasVersion = systemRows.some(function (row) { return row[0] === 'SCHEMA_VERSION'; });
  if (!hasVersion) system.getRange(system.getLastRow() + 1, 1, 1, 3).setValues([['SCHEMA_VERSION', SheetFlowSchema.version, new Date()]]);
  return SheetFlowSchema.report(book);
}

function schemaHealthCheck() {
  var book = getBook_();
  return { spreadsheetUrl: book.getUrl(), schema: SheetFlowSchema.report(book), legacyIssuesRows: Math.max(0, book.getSheetByName('Issues').getLastRow() - 1) };
}

function migrationDryRun() {
  var book = getBook_();
  var sheet = book.getSheetByName('Issues');
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, TrackerCore.fields.length).getValues();
  var ids = {}, duplicates = [], invalid = [], mapped = { epics: 0, stories: 0, tasks: 0, bugs: 0 };
  rows.forEach(function (row, index) {
    if (row.every(function (value) { return value === ''; })) return;
    var id = String(row[0] || '');
    if (ids[id]) duplicates.push(id); ids[id] = true;
    var type = String(row[1] || '');
    if (!SheetFlowSchema || ['Epic', 'Story', 'Task', 'Bug'].indexOf(type) < 0) invalid.push({ row: index + 2, issue: id, reason: 'invalid type' });
    else mapped[type.toLowerCase() + 's'] = (mapped[type.toLowerCase() + 's'] || 0) + 1;
    if (!row[3]) invalid.push({ row: index + 2, issue: id, reason: 'missing summary' });
  });
  return { schemaVersion: SheetFlowSchema.version, sourceRows: rows.filter(function (row) { return row.some(function (value) { return value !== ''; }); }).length, duplicates: duplicates, invalid: invalid, mapped: mapped, canMigrate: duplicates.length === 0 && invalid.length === 0, targetTabs: SheetFlowSchema.tabNames() };
}

function migrateLegacyIssues() {
  return withLock_(function () {
    var book = getBook_();
    var dryRun = migrationDryRun();
    if (!dryRun.canMigrate) throw new Error('Migration stopped. Run migrationDryRun and resolve duplicate or invalid legacy rows first.');
    ensureSchemaTabs_(book);
    var source = book.getSheetByName('Issues');
    var target = book.getSheetByName(SheetFlowSchema.tabs.tasks.name);
    if (target.getLastRow() > 1) throw new Error('Tasks already contains data. Migration is intentionally non-destructive and will not append duplicates.');
    var legacyRows = source.getLastRow() < 2 ? [] : source.getRange(2, 1, source.getLastRow() - 1, TrackerCore.fields.length).getValues().filter(function (row) { return row.some(function (value) { return value !== ''; }); });
    var project = book.getSheetByName(SheetFlowSchema.tabs.projects.name);
    project.getRange(2, 1, 1, SheetFlowSchema.tabs.projects.headers.length).setValues([['PROJECT-1', 'Project', '', 'Migrated project', 'Created from the legacy Issues tab.', '', '', '', 1000, true, '', 1]]);
    var epics = legacyRows.filter(function (row) { return row[1] === 'Epic'; });
    if (epics.length) project.getRange(3, 1, epics.length, SheetFlowSchema.tabs.projects.headers.length).setValues(epics.map(function (row, index) { return [String(row[0]), 'Epic', 'PROJECT-1', String(row[3]), String(row[4] || ''), String(row[7] || ''), row[9] || '', row[10] || '', (index + 1) * 1000, true, '', 1]; }));
    var tasks = legacyRows.filter(function (row) { return row[1] !== 'Epic'; }).map(function (row, index) {
      var legacy = {}; TrackerCore.fields.forEach(function (field, n) { legacy[field.key] = row[n]; });
      var kind = row[1] === 'Story' ? 'Story' : 'Task';
      return [String(row[0]), kind, row[1] === 'Bug' ? 'bug' : 'general', 'PROJECT-1', String(row[2] || '').startsWith('PRJ-') ? String(row[2]) : '', String(row[2] || ''), String(row[3] || ''), String(row[4] || ''), '', String(row[5] || 'Backlog') === 'To Do' ? 'Ready' : String(row[5] || 'Backlog'), String(row[6] || 'Medium'), String(row[7] || ''), String(row[8] || ''), row[9] || '', row[10] || '', row[11] || '', Number(row[12] || 0), Number(row[13] || 0), Number(row[14] || 0), String(row[15] || ''), String(row[16] || ''), String(row[17] || ''), '', '', '', '', '', '', '', '', row[18] || '', '', row[19] || '', '', '', '', '', 1, '', '', JSON.stringify(legacy), Number(row[20] || (index + 1) * 1000)];
    });
    if (tasks.length) target.getRange(2, 1, tasks.length, SheetFlowSchema.tabs.tasks.headers.length).setValues(tasks);
    PropertiesService.getScriptProperties().setProperty('SHEETFLOW_SCHEMA_VERSION', SheetFlowSchema.version);
    return { migratedTasks: tasks.length, migratedEpics: epics.length, spreadsheetUrl: book.getUrl(), schema: SheetFlowSchema.report(book) };
  });
}
