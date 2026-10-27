/** Shared rank ordering operations for tasks and board scopes. */
var SheetFlowOrdering = (function () {
  'use strict';
  function normalize(items) {
    return items.slice().sort(function (a, b) { return Number(a.rank) - Number(b.rank) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }); }).map(function (item, index) {
      return { id: item.id, rank: (index + 1) * 1000 };
    });
  }
  function move(items, id, beforeId) {
    var ordered = items.filter(function (item) { return item.id !== id; });
    var moving = items.find(function (item) { return item.id === id; });
    if (!moving) throw new Error('ORDER_NOT_FOUND: task does not exist in this ordering scope.');
    var index = beforeId ? ordered.findIndex(function (item) { return item.id === beforeId; }) : ordered.length;
    if (index < 0) throw new Error('ORDER_NOT_FOUND: insertion target does not exist in this ordering scope.');
    ordered.splice(index, 0, moving);
    return normalize(ordered);
  }
  return { normalize: normalize, move: move };
})();

function reorderIssue(id, beforeId, expectedVersion) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('write');
  return withLock_(function () {
    var book = getBook_(), issues = readIssues_(book), moving = issues.find(function (issue) { return issue.id === id; });
    if (!moving) throw new Error('ORDER_NOT_FOUND: task does not exist.');
    if (moving.version !== expectedVersion) throw new Error('ORDER_CONFLICT: task changed elsewhere. Refresh before reordering.');
    var scope = issues.filter(function (issue) { return issue.status === moving.status; });
    var ranks = SheetFlowOrdering.move(scope, id, beforeId);
    var sheet = book.getSheetByName('Issues');
    ranks.forEach(function (rank) { var issue = issues.find(function (item) { return item.id === rank.id; }); sheet.getRange(issue._row, 21).setValue(rank.rank); });
    SpreadsheetApp.flush();
    var saved = readIssues_(book).find(function (issue) { return issue.id === id; });
    historyService_().record(book, { entityId: id, eventKind: 'reordered', beforeRevision: moving.version, afterRevision: saved.version, changedFields: ['rank'], details: { beforeId: beforeId || null, status: moving.status } });
    return saved;
  });
}
