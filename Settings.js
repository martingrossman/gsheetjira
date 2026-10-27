/** Versioned settings and configurable task-type definitions. */
var SheetFlowSettings = (function () {
  'use strict';
  var defaults = [
    ['TYPE-ALGO', 'taskType', 'algo', 'Algo', 'json', true, 10],
    ['TYPE-DATA', 'taskType', 'data', 'Data', 'json', true, 20],
    ['TYPE-REQUIREMENTS', 'taskType', 'requirements', 'Requirements', 'json', true, 30],
    ['TYPE-BUG', 'taskType', 'bug', 'Bug', 'json', true, 40],
    ['DEFAULT-TASK-TYPE', 'workflow', 'defaultTaskType', 'algo', 'text', true, 10],
    ['DEFAULT-STATUS', 'workflow', 'defaultStatus', 'Backlog', 'text', true, 20]
  ];
  function sheet(book) {
    var result = book.getSheetByName('Settings');
    return result && result.getName && result.getName() === 'Settings' ? result : null;
  }
  function ensure(book) {
    var target = sheet(book); if (!target) return [];
    if (target.getLastRow() < 2) target.getRange(2, 1, defaults.length, 9).setValues(defaults.map(function (row) { return row.concat([new Date(), 'system']); }));
    return read(book);
  }
  function read(book) {
    var target = sheet(book); if (!target || target.getLastRow() < 2) return defaults.map(toSetting);
    return target.getRange(2, 1, target.getLastRow() - 1, 9).getValues().filter(function (row) { return row[0] !== ''; }).map(function (row) {
      return { id: String(row[0]), category: String(row[1]), key: String(row[2]), value: row[3], valueType: String(row[4]), active: row[5] !== false, order: Number(row[6]) || 0, updatedAt: row[7], updatedBy: String(row[8] || '') };
    });
  }
  function toSetting(row) { return { id: row[0], category: row[1], key: row[2], value: row[3], valueType: row[4], active: row[5], order: row[6], updatedAt: '', updatedBy: 'system' }; }
  function update(book, id, value, active) {
    var target = sheet(book); if (!target) throw new Error('Settings tab is not available. Run the schema migration first.');
    var values = target.getRange(2, 1, Math.max(0, target.getLastRow() - 1), 9).getValues();
    var index = values.findIndex(function (row) { return String(row[0]) === String(id); });
    if (index < 0) throw new Error('Unknown setting: ' + id);
    target.getRange(index + 2, 4).setValue(value); if (active != null) target.getRange(index + 2, 6).setValue(Boolean(active));
    target.getRange(index + 2, 8, 1, 2).setValues([[new Date(), actor_()]]);
    return read(book).find(function (setting) { return setting.id === id; });
  }
  function actor_() { try { return Session.getActiveUser().getEmail() || 'owner-session'; } catch (ignore) { return 'owner-session'; } }
  return { defaults: defaults, ensure: ensure, read: read, update: update };
})();

function getTrackerSettings() {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  return SheetFlowSettings.read(getBook_());
}
function updateTrackerSetting(id, value, active) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('configure');
  return withLock_(function () { return SheetFlowSettings.update(getBook_(), id, value, active); });
}
