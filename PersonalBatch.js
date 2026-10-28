/** Create independent personal-mode items from one fresh snapshot and one atomic write. Caller holds the script lock. */
function createPersonalIssuesBatch_(book, items, request) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Submit between 1 and 100 issue titles per batch.');
  request = request || saveRequestContext_();
  var systemRows = readSystemRows_(book), history = historyService_();
  var snapshot = { versioned: false, systemRows: systemRows, taskTypes: SheetFlowSettings.taskTypeMap(book, systemRows), onlyVersionFor: '' };
  var issues = readIssues_(book, snapshot), projected = issues.slice(), accepted = [], results = [], errors = [], operationIds = new Set();
  var previousHighest = Math.max(Number(request.config.LAST_ISSUE_NUMBER) || 0, 0), highest = previousHighest;
  issues.forEach(function (issue) { var match = /^PRJ-(\d+)$/.exec(issue.id); if (match) highest = Math.max(highest, Number(match[1])); });
  if (!Number.isSafeInteger(highest)) throw new Error('The issue ID counter is invalid. Repair LAST_ISSUE_NUMBER before creating tasks.');
  var now = new Date().toISOString(), today = today_(book);
  items.forEach(function (item, index) {
    try {
      if (!item || !item.input || typeof item.input !== 'object' || Array.isArray(item.input)) throw new Error('Missing issue fields.');
      var input = Object.assign({}, item.input);
      if (input.id) throw new Error('This batch accepts new issues only.');
      var operationId = String(item.operationId || input.operationId || Utilities.getUuid());
      if (operationIds.has(operationId)) throw new Error('Each batch item needs a unique operation ID.');
      operationIds.add(operationId);
      var receipt = history.findReceipt(book, operationId, systemRows);
      if (receipt) { results.push({ index: index, issue: clientIssue_(receipt.result) }); return; }
      var issue = TrackerCore.prepare(input, null, today, now);
      if (highest >= Number.MAX_SAFE_INTEGER) throw new Error('The issue ID counter is exhausted. Repair LAST_ISSUE_NUMBER before creating tasks.');
      issue.id = 'PRJ-' + (++highest);
      TrackerCore.validate(issue, projected);
      projected.push(issue);
      accepted.push({ index: index, issue: issue, operationId: operationId });
    } catch (error) { errors.push({ index: index, message: error && error.message ? error.message : String(error) }); }
  });
  // Reserve once, including skipped invalid-item IDs, so rejected/lost requests never reuse an issued ID.
  if (highest > previousHighest) {
    request.properties.setProperty('LAST_ISSUE_NUMBER', String(highest));
    request.config.LAST_ISSUE_NUMBER = String(highest);
  }
  if (accepted.length) {
    var cursor = {}, plans = accepted.map(function (entry) { return planPersonalIssueWrite_(book, entry.issue, null, snapshot, entry.operationId, cursor); });
    var saved = commitPersonalIssueWrites_(book, plans, request.timing);
    accepted.forEach(function (entry, index) { results.push({ index: entry.index, issue: saved[index] }); });
  }
  results.sort(function (left, right) { return left.index - right.index; });
  return { items: results, errors: errors };
}
