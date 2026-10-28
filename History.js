/** Append-only mutation history and bounded idempotency receipts. */
var SheetFlowHistory = (function () {
  'use strict';
  var receiptPrefix = 'IDEMPOTENCY:';
  function record(book, event) {
    var sheet = book.getSheetByName('Change History');
    if (!sheet) return null;
    var row = [
      event.eventId || Utilities.getUuid(), event.operationId || Utilities.getUuid(),
      event.entityKind || 'Task', event.entityId || '', event.eventKind || 'updated',
      event.actorId || actorId_(), new Date(event.timestamp || Date.now()),
      event.beforeRevision || '', event.afterRevision || '',
      JSON.stringify(event.changedFields || []), JSON.stringify(event.details || {})
    ];
    sheet.getRange(Math.max(2, sheet.getLastRow() + 1), 1, 1, row.length).setValues([row]);
    return row[0];
  }
  function receipt(book, operationId, result, systemRows) {
    if (!operationId) return;
    var sheet = book.getSheetByName('_System');
    if (!sheet) return;
    var key = receiptPrefix + operationId;
    var rows = systemRows || (sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : []);
    var value = JSON.stringify({ savedAt: new Date().toISOString(), result: result });
    var index = rows.findIndex(function (row) { return String(row[0]) === key; });
    if (index >= 0) sheet.getRange(index + 2, 2).setValue(value);
    else sheet.getRange(Math.max(2, sheet.getLastRow() + 1), 1, 1, 3).setValues([[key, value, new Date()]]);
  }
  function findReceipt(book, operationId, systemRows) {
    if (!operationId) return null;
    var sheet = book.getSheetByName('_System');
    if (!sheet || sheet.getLastRow() < 2) return null;
    var key = receiptPrefix + operationId;
    var rows = systemRows || sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === key) {
      try { return JSON.parse(rows[i][1]); } catch (ignore) { return null; }
    }
    return null;
  }
  function list(book, entityId, limit, offset) {
    var sheet = book.getSheetByName('Change History');
    if (!sheet || sheet.getLastRow() < 2) return { items: [], nextOffset: null };
    limit = Math.max(1, Math.min(Number(limit) || 50, 200)); offset = Math.max(0, Number(offset) || 0);
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues().filter(function (row) { return !entityId || String(row[3]) === String(entityId); });
    rows.reverse();
    var items = rows.slice(offset, offset + limit).map(function (row) { return { eventId: row[0], operationId: row[1], entityKind: row[2], entityId: row[3], eventKind: row[4], actorId: row[5], timestamp: row[6], beforeRevision: row[7], afterRevision: row[8], changedFields: row[9], details: row[10] }; });
    return { items: items, nextOffset: offset + items.length < rows.length ? offset + items.length : null };
  }
  function actorId_() { try { return Session.getActiveUser().getEmail() || 'unknown'; } catch (ignore) { return 'unknown'; } }
  return { record: record, receipt: receipt, findReceipt: findReceipt, list: list };
})();

function getTaskHistory(entityId, limit, offset) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  return browserValue_(SheetFlowHistory.list(getBook_(), entityId, limit, offset));
}
