/** Task comments with stable IDs and append-oriented history. */
var SheetFlowComments = (function () {
  'use strict';
  function target(book) { var sheet = book.getSheetByName('Comments'); return sheet && sheet.getName && sheet.getName() === 'Comments' ? sheet : null; }
  function actor() { try { return Session.getActiveUser().getEmail() || 'owner-session'; } catch (ignore) { return 'owner-session'; } }
  function read(book, taskId) {
    var sheet = target(book); if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues().filter(function (row) { return row[0] && (!taskId || String(row[1]) === String(taskId)); }).map(function (row) {
      return { id: String(row[0]), taskId: String(row[1]), authorId: String(row[2] || ''), body: String(row[3] || ''), createdAt: row[4], updatedAt: row[5], editedBy: String(row[6] || '') };
    });
  }
  function add(book, taskId, body) {
    var sheet = target(book); if (!sheet) throw new Error('Comments tab is not available. Run the schema migration first.');
    body = String(body || '').trim(); if (!body || body.length > 5000) throw new Error('Comment must contain between 1 and 5,000 characters.');
    var now = new Date(), comment = { id: 'COM-' + Utilities.getUuid(), taskId: String(taskId), authorId: actor(), body: body, createdAt: now, updatedAt: now, editedBy: '' };
    sheet.getRange(Math.max(2, sheet.getLastRow() + 1), 1, 1, 7).setValues([[comment.id, comment.taskId, comment.authorId, comment.body, now, now, '']]);
    return comment;
  }
  function update(book, id, body) {
    var sheet = target(book); if (!sheet) throw new Error('Comments tab is not available. Run the schema migration first.');
    body = String(body || '').trim(); if (!body || body.length > 5000) throw new Error('Comment must contain between 1 and 5,000 characters.');
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues() : [], index = rows.findIndex(function (row) { return String(row[0]) === String(id); });
    if (index < 0) throw new Error('Comment not found.');
    var now = new Date(), row = index + 2; sheet.getRange(row, 4).setValue(body); sheet.getRange(row, 6, 1, 2).setValues([[now, actor()]]);
    return read(book).find(function (comment) { return comment.id === id; });
  }
  return { read: read, add: add, update: update };
})();

function getTaskComments(taskId) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  return browserValue_(SheetFlowComments.read(getBook_(), taskId));
}
function addTaskComment(taskId, body) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('write');
  return withLock_(function () { return browserValue_(SheetFlowComments.add(getBook_(), taskId, body)); });
}
function updateTaskComment(commentId, body) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('write');
  return withLock_(function () { return browserValue_(SheetFlowComments.update(getBook_(), commentId, body)); });
}
