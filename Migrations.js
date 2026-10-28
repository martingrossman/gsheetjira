/** Non-destructive legacy Issues -> versioned workbook migration. */
function ensureSchemaTabs_(book) {
  Object.keys(SheetFlowSchema.tabs).forEach(function (key) {
    var definition = SheetFlowSchema.tabs[key];
    var sheet = book.getSheetByName(definition.name) || book.insertSheet(definition.name);
    var current = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, definition.headers.length).getValues()[0] : [];
    while (current.length && current[current.length - 1] === '') current.pop();
    if (!current.length || current.every(function (value) { return value === ''; })) {
      sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
      sheet.setFrozenRows(1);
    } else if (current.length <= definition.headers.length && current.join('|') === definition.headers.slice(0, current.length).join('|')) {
      // Additive schema updates extend headers without moving or rewriting data.
      sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
    } else {
      throw new Error(definition.name + ' has unexpected headers. Rename it or repair it before migration.');
    }
  });
  var system = book.getSheetByName(SheetFlowSchema.tabs.system.name);
  var systemRows = system.getLastRow() > 1 ? system.getRange(2, 1, system.getLastRow() - 1, 2).getValues() : [];
  var versionIndex = systemRows.findIndex(function (row) { return row[0] === 'SCHEMA_VERSION'; });
  if (versionIndex < 0) system.getRange(system.getLastRow() + 1, 1, 1, 3).setValues([['SCHEMA_VERSION', SheetFlowSchema.version, new Date()]]);
  else system.getRange(versionIndex + 2, 2, 1, 2).setValues([[SheetFlowSchema.version, new Date()]]);
  if (typeof SheetFlowSettings !== 'undefined') SheetFlowSettings.ensure(book);
  return SheetFlowSchema.report(book);
}

function schemaHealthCheck() {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  var book = getBook_();
  return { spreadsheetUrl: book.getUrl(), schema: SheetFlowSchema.report(book), legacyIssuesRows: Math.max(0, book.getSheetByName('Issues').getLastRow() - 1) };
}

function migrationDryRun() {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  var book = getBook_();
  var sheet = book.getSheetByName('Issues');
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, TrackerCore.fields.length).getValues();
  var ids = {}, duplicates = [], invalid = [], mapped = { epics: 0, stories: 0, tasks: 0, bugs: 0 };
  var issueRows = [], taskTypes = typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.taskTypeMap(book) : {};
  rows.forEach(function (row, index) {
    if (row.every(function (value) { return value === ''; })) return;
    var id = String(row[0] || '');
    if (!id) invalid.push({ row: index + 2, issue: '', reason: 'missing ID' });
    if (id && ids[id]) duplicates.push(id); ids[id] = true;
    var type = String(row[1] || '');
    if (!SheetFlowSchema || ['Epic', 'Story', 'Task', 'Bug'].indexOf(type) < 0) invalid.push({ row: index + 2, issue: id, reason: 'invalid type' });
    else mapped[type.toLowerCase() + 's'] = (mapped[type.toLowerCase() + 's'] || 0) + 1;
    if (!row[3]) invalid.push({ row: index + 2, issue: id, reason: 'missing summary' });
    if (TrackerCore.statuses.indexOf(String(row[5] || '')) < 0) invalid.push({ row: index + 2, issue: id, reason: 'invalid status' });
    if (TrackerCore.priorities.indexOf(String(row[6] || '')) < 0) invalid.push({ row: index + 2, issue: id, reason: 'invalid priority' });
    issueRows.push(issueFromRow_(row, index + 2, book, taskTypes));
  });
  issueRows.forEach(function (issue) {
    if (!issue.id || !issue.summary || !TrackerCore.types.includes(issue.type) || !TrackerCore.statuses.includes(issue.status) || !TrackerCore.priorities.includes(issue.priority)) return;
    try { TrackerCore.validate(issue, issueRows); }
    catch (error) { invalid.push({ row: issue._row, issue: issue.id, reason: error.message || String(error) }); }
  });
  var duplicateRows = duplicates.map(function (id) { return { issue: id, reason: 'duplicate ID' }; });
  invalid = invalid.filter(function (entry, index, all) { return all.findIndex(function (other) { return other.row === entry.row && other.reason === entry.reason; }) === index; });
  return { schemaVersion: SheetFlowSchema.version, sourceRows: rows.filter(function (row) { return row.some(function (value) { return value !== ''; }); }).length, duplicates: duplicates, invalid: invalid.concat(duplicateRows), mapped: mapped, canMigrate: duplicates.length === 0 && invalid.length === 0, targetTabs: SheetFlowSchema.tabNames() };
}

function migrateLegacyIssues() {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('configure');
  return withLock_(function () {
    var book = getBook_();
    var dryRun = migrationDryRun();
    if (!dryRun.canMigrate) throw new Error('Migration stopped. Run migrationDryRun and resolve duplicate or invalid legacy rows first.');
    ensureSchemaTabs_(book);
    var source = book.getSheetByName('Issues');
    var target = book.getSheetByName(SheetFlowSchema.tabs.tasks.name);
    var legacyRows = source.getLastRow() < 2 ? [] : source.getRange(2, 1, source.getLastRow() - 1, TrackerCore.fields.length).getValues().filter(function (row) { return row.some(function (value) { return value !== ''; }); });
    var project = book.getSheetByName(SheetFlowSchema.tabs.projects.name);
    var existingTasks = target.getLastRow() > 1 ? target.getRange(2, 1, target.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0] || ''); }).filter(Boolean) : [];
    var existingProjects = project.getLastRow() > 1 ? project.getRange(2, 1, project.getLastRow() - 1, 2).getValues() : [];
    var expectedTaskIds = legacyRows.filter(function (row) { return row[1] !== 'Epic'; }).map(function (row) { return String(row[0]); }).sort();
    var epics = legacyRows.filter(function (row) { return row[1] === 'Epic'; });
    var expectedEpicIds = epics.map(function (row) { return String(row[0]); }).sort();
    if (existingTasks.length || existingProjects.length) {
      var presentEpicIds = existingProjects.filter(function (row) { return String(row[1]) === 'Epic'; }).map(function (row) { return String(row[0]); }).sort();
      var hasProject = existingProjects.some(function (row) { return String(row[0]) === 'PROJECT-1' && String(row[1]) === 'Project'; });
      if (existingTasks.sort().join('|') === expectedTaskIds.join('|') && presentEpicIds.join('|') === expectedEpicIds.join('|') && hasProject && existingProjects.length === expectedEpicIds.length + 1) {
        markMigrationComplete_(book, legacyRows.length);
        return { migratedTasks: expectedTaskIds.length, migratedEpics: expectedEpicIds.length, alreadyMigrated: true, spreadsheetUrl: book.getUrl(), schema: SheetFlowSchema.report(book) };
      }
      throw new Error('Migration stopped. V2 tabs already contain records that do not match this legacy source; no rows were changed.');
    }
    function legacyObject(row) { var value = {}; TrackerCore.fields.forEach(function (field, index) { value[field.key] = row[index]; }); return value; }
    function projectRow(record) { return SheetFlowSchema.tabs.projects.headers.map(function (header) { return record[header] == null ? '' : record[header]; }); }
    var projectRecords = [{ ID: 'PROJECT-1', 'Entity Kind': 'Project', 'Project ID': '', Title: 'Migrated project', Description: 'Created from the legacy Issues tab.', 'Owner ID': '', 'Start Date': '', 'Due Date': '', Order: 1000, Active: true, 'Archived At': '', Revision: 1, 'Legacy JSON': '' }];
    epics.forEach(function (row, index) {
      var epicLegacy = legacyObject(row);
      epicLegacy.__sheetflow = { id: String(row[0]), revision: 1, createdAt: row[18] instanceof Date ? row[18].toISOString() : String(row[18] || ''), archivedAt: '', archivedBy: '', active: true };
      projectRecords.push({ ID: String(row[0]), 'Entity Kind': 'Epic', 'Project ID': 'PROJECT-1', Title: String(row[3]), Description: String(row[4] || ''), 'Owner ID': String(row[7] || ''), 'Start Date': row[9] || '', 'Due Date': row[10] || '', Order: (index + 1) * 1000, Active: true, 'Archived At': '', Revision: 1, 'Legacy JSON': JSON.stringify(epicLegacy) });
    });
    project.getRange(2, 1, projectRecords.length, SheetFlowSchema.tabs.projects.headers.length).setValues(projectRecords.map(projectRow));
    var typeMap = typeof SheetFlowSettings !== 'undefined' ? SheetFlowSettings.taskTypeMap(book) : {};
    var typeById = {};
    legacyRows.forEach(function (row) { typeById[String(row[0])] = String(row[1] || ''); });
    var tasks = legacyRows.filter(function (row) { return row[1] !== 'Epic'; }).map(function (row, index) {
      var legacy = {}; TrackerCore.fields.forEach(function (field, n) { legacy[field.key] = row[n]; });
      var kind = row[1] === 'Story' ? 'Story' : 'Task';
      var parentId = String(row[2] || ''), parentKind = typeById[parentId] || '';
      var epicId = parentKind === 'Epic' ? parentId : '';
      var parentTaskId = parentId && parentKind !== 'Epic' ? parentId : '';
      var parentRow = legacyRows.find(function (candidate) { return String(candidate[0]) === parentId; }), seenParents = {};
      while (!epicId && parentRow && !seenParents[String(parentRow[0])]) {
        seenParents[String(parentRow[0])] = true;
        if (String(parentRow[1]) === 'Epic') { epicId = String(parentRow[0]); break; }
        parentRow = legacyRows.find(function (candidate) { return String(candidate[0]) === String(parentRow[2] || ''); });
      }
      var taskTypeId = String(typeMap[String(row[0])] || (row[1] === 'Bug' ? 'bug' : 'algo'));
      legacy.__sheetflow = { id: String(row[0]), revision: 1, createdAt: row[18] instanceof Date ? row[18].toISOString() : String(row[18] || ''), archivedAt: '', archivedBy: '', claimedBy: '', claimedAt: '', updatedBy: '', lastAgentActivity: '' };
      var record = {
        ID: String(row[0]), Kind: kind, 'Task Type ID': taskTypeId, 'Project ID': 'PROJECT-1', 'Epic ID': epicId,
        'Parent Task ID': parentTaskId, Title: String(row[3] || ''), Description: String(row[4] || ''), 'Acceptance Criteria': '',
        Status: String(row[5] || 'Backlog') === 'To Do' ? 'Ready' : String(row[5] || 'Backlog'), Priority: String(row[6] || 'Medium'),
        'Assignee ID': String(row[7] || ''), Reporter: String(row[8] || ''), 'Start Date': row[9] || '', 'Due Date': row[10] || '',
        'Completed Date': row[11] || '', 'Estimate (h)': Number(row[12] || 0), 'Time Spent (h)': Number(row[13] || 0), 'Progress (%)': Number(row[14] || 0),
        Tags: String(row[15] || ''), Sprint: String(row[16] || ''), Dependencies: String(row[17] || ''), 'Repository URL': '', Branch: '',
        'Pull Request URL': '', 'Agent Instructions': '', 'Verification Commands': '', 'Result Summary': '', 'Evidence Links': '', 'Blocker Reason': '',
        'Created At': row[18] || '', 'Created By': '', 'Updated At': row[19] || '', 'Updated By': '', 'Claimed By': '', 'Claimed At': '',
        'Last Agent Activity': '', Revision: 1, 'Archived At': '', 'Archived By': '', 'Legacy JSON': JSON.stringify(legacy), Order: Number(row[20] || (index + 1) * 1000)
      };
      return SheetFlowSchema.tabs.tasks.headers.map(function (header) { return record[header] == null ? '' : record[header]; });
    });
    if (tasks.length) target.getRange(2, 1, tasks.length, SheetFlowSchema.tabs.tasks.headers.length).setValues(tasks);
    PropertiesService.getScriptProperties().setProperty('SHEETFLOW_SCHEMA_VERSION', SheetFlowSchema.version);
    markMigrationComplete_(book, legacyRows.length);
    return { migratedTasks: tasks.length, migratedEpics: epics.length, spreadsheetUrl: book.getUrl(), schema: SheetFlowSchema.report(book) };
  });
}
function markMigrationComplete_(book, sourceCount) {
  var system = book.getSheetByName(SheetFlowSchema.tabs.system.name), now = new Date();
  var metadata = [['MIGRATION_STATUS', 'complete'], ['MIGRATION_COMPLETED_AT', now.toISOString()], ['MIGRATION_SOURCE_COUNT', sourceCount]];
  metadata.forEach(function (item) {
    var current = system.getLastRow() > 1 ? system.getRange(2, 1, system.getLastRow() - 1, 2).getValues() : [];
    var existing = current.findIndex(function (row) { return String(row[0]) === item[0]; });
    if (existing >= 0) system.getRange(existing + 2, 2, 1, 2).setValues([[item[1], now]]);
    else system.getRange(Math.max(2, system.getLastRow() + 1), 1, 1, 3).setValues([[item[0], item[1], now]]);
  });
  PropertiesService.getScriptProperties().setProperty('SHEETFLOW_SCHEMA_VERSION', SheetFlowSchema.version);
}
