/** Header-based access to versioned SheetFlow tabs. */
var SheetFlowRepository = (function () {
  'use strict';
  function definition(tab) {
    if (!SheetFlowSchema.tabs[tab]) throw new Error('Unknown SheetFlow tab: ' + tab);
    return SheetFlowSchema.tabs[tab];
  }
  function sheet(book, tab) {
    var definition_ = definition(tab);
    var result = book.getSheetByName(definition_.name);
    if (!result) throw new Error('Missing SheetFlow tab: ' + definition_.name);
    return result;
  }
  function records(book, tab) {
    var definition_ = definition(tab), target = sheet(book, tab);
    if (target.getLastRow() < 2) return [];
    var values = target.getRange(2, 1, target.getLastRow() - 1, definition_.headers.length).getValues();
    return values.map(function (row, index) {
      if (row.every(function (value) { return value === ''; })) return null;
      var record = { _row: index + 2 };
      definition_.headers.forEach(function (header, column) { record[header] = row[column]; });
      return record;
    }).filter(Boolean);
  }
  function rows(tab, records_) {
    var definition_ = definition(tab);
    return records_.map(function (record) { return definition_.headers.map(function (header) { return record[header] == null ? '' : record[header]; }); });
  }
  function append(book, tab, records_) {
    if (!records_.length) return [];
    var target = sheet(book, tab), values = rows(tab, records_);
    target.getRange(Math.max(2, target.getLastRow() + 1), 1, values.length, values[0].length).setValues(values);
    return records(book, tab).slice(-records_.length);
  }
  function replace(book, tab, records_) {
    var definition_ = definition(tab), target = sheet(book, tab);
    if (target.getLastRow() > 1) target.getRange(2, 1, target.getLastRow() - 1, definition_.headers.length).clearContent();
    if (records_.length) target.getRange(2, 1, records_.length, definition_.headers.length).setValues(rows(tab, records_));
    return records(book, tab);
  }
  return { records: records, rows: rows, append: append, replace: replace };
})();
