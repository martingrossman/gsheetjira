const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../Core.js');

function setupHarness({ standalone = false, data = [], frozenReturn } = {}) {
  const rows = data.length ? [C.fields.map(f => f.label), ...data] : [];
  const properties = new Map(), triggers = [], formatting = {};
  let exists = data.length > 0, maxRows = 20, maxColumns = 5, filter = null;
  let createdBooks = 0, acquired = 0, released = 0;
  function builder(methods) {
    const result = { build: () => ({}) };
    methods.forEach(name => { result[name] = () => result; });
    return result;
  }
  function range(row, column, height = 1, width = 1) {
    const result = {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[column - 1 + c] ?? '')),
      setValues: values => { values.forEach((line, r) => { rows[row - 1 + r] = [...line]; }); return result; },
      createFilter: () => { filter = { remove: () => { filter = null; } }; return filter; }
    };
    ['setBackground', 'setFontColor', 'setFontWeight', 'setWrap', 'setFontFamily', 'setFontSize', 'setVerticalAlignment', 'setNumberFormat', 'setDataValidation'].forEach(name => { result[name] = () => result; });
    return result;
  }
  const sheet = {
    getLastRow: () => rows.length, getRange: range, getMaxRows: () => maxRows, getMaxColumns: () => maxColumns,
    insertRowsAfter: (_, count) => { maxRows += count; return sheet; },
    insertColumnsAfter: (_, count) => { maxColumns += count; return sheet; },
    // These Google Sheet methods return void, not the Sheet. Match the reported null return too.
    setFrozenRows: count => { formatting.frozenRows = count; return frozenReturn; },
    setFrozenColumns: count => { formatting.frozenColumns = count; return frozenReturn; },
    setRowHeight: (row, height) => { formatting.rowHeight = [row, height]; return sheet; },
    setColumnWidth: () => sheet, getFilter: () => filter,
    setConditionalFormatRules: rules => { formatting.rules = rules.length; }
  };
  const book = {
    getId: () => 'tracker-book', getUrl: () => 'https://docs.google.com/spreadsheets/d/tracker-book/edit',
    getSheetByName: () => exists ? sheet : null,
    insertSheet: name => { assert.equal(name, 'Issues'); exists = true; return sheet; }
  };
  const context = vm.createContext({ console: { log() {} }, TrackerCore: C,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => standalone ? null : book,
      openById: id => { assert.equal(id, book.getId()); return book; },
      create: () => { createdBooks++; return book; },
      newDataValidation: () => builder(['requireDate', 'setAllowInvalid', 'requireNumberGreaterThanOrEqualTo', 'requireValueInList', 'requireNumberBetween']),
      newConditionalFormatRule: () => builder(['whenTextEqualTo', 'setBackground', 'setRanges', 'whenFormulaSatisfied', 'setFontColor'])
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => { properties.set(key, value); } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => acquired++, releaseLock: () => released++ }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: handler => ({ forSpreadsheet: target => { assert.equal(target, book); return { onEdit: () => ({ create: () => { triggers.push({ getHandlerFunction: () => handler, getTriggerSourceId: () => book.getId() }); } }) }; } })
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Code.js'), 'utf8'), context);
  return { api: context, properties, rows, triggers, formatting, createdBooks: () => createdBooks, balanced: () => acquired === released };
}

for (const frozenReturn of [null, undefined]) {
  test(`setup completes when frozen pane setters return ${String(frozenReturn)}`, () => {
    const h = setupHarness({ frozenReturn });
    const result = h.api.setupTracker();
    assert.equal(result.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/tracker-book/edit');
    assert.deepEqual(h.rows[0], C.fields.map(f => f.label));
    assert.deepEqual(h.formatting, { frozenRows: 1, frozenColumns: 1, rowHeight: [1, 40], rules: 6 });
    assert.equal(h.properties.get('EDIT_TRIGGER_INSTALLED'), 'true');
    assert.ok(h.balanced());
  });
}
test('re-running standalone setup reuses the spreadsheet and edit trigger', () => {
  const h = setupHarness({ standalone: true });
  h.api.setupTracker(); h.api.setupTracker();
  assert.equal(h.createdBooks(), 1); assert.equal(h.triggers.length, 1); assert.ok(h.balanced());
});
test('setup repairs formatting without modifying existing issue rows', () => {
  const issue = C.sample('2026-10-27')[0];
  const row = C.fields.map(f => issue[f.key]);
  const h = setupHarness({ data: [row] });
  h.api.setupTracker();
  assert.deepEqual(h.rows[1], row); assert.equal(h.rows.length, 2); assert.ok(h.balanced());
});
