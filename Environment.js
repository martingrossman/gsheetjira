/** Environment configuration and startup diagnostics for Apps Script. */
var SheetFlowEnvironment = (function () {
  'use strict';
  var names = ['development', 'test', 'production'];
  function properties() { return PropertiesService.getScriptProperties(); }
  function currentName() {
    var value = String(properties().getProperty('SHEETFLOW_ENV') || 'development').toLowerCase();
    return names.indexOf(value) >= 0 ? value : 'development';
  }
  function key(name) { return 'SHEETFLOW_SPREADSHEET_ID_' + String(name).toUpperCase(); }
  function spreadsheetId(name) {
    var selected = name || currentName();
    return properties().getProperty(key(selected)) || properties().getProperty('SPREADSHEET_ID') || '';
  }
  function configure(name, id) {
    name = String(name || '').toLowerCase();
    if (names.indexOf(name) < 0) throw new Error('Environment must be development, test, or production.');
    if (id != null && String(id).trim()) properties().setProperty(key(name), String(id).trim());
    properties().setProperty('SHEETFLOW_ENV', name);
    return config();
  }
  function config() {
    var name = currentName(), id = spreadsheetId(name);
    return { name: name, spreadsheetId: id, configured: Boolean(id), scriptId: ScriptApp.getScriptId() };
  }
  function health(book) {
    var triggers = ScriptApp.getProjectTriggers().map(function (trigger) {
      return { handler: trigger.getHandlerFunction(), sourceId: trigger.getTriggerSourceId() };
    });
    var schema = typeof SheetFlowSchema !== 'undefined' ? SheetFlowSchema.report(book) : { ready: false, missingTabs: ['Schema.js'] };
    return {
      ok: Boolean(book) && schema.ready && triggers.some(function (trigger) { return trigger.handler === 'handleSheetEdit' && trigger.sourceId === book.getId(); }),
      environment: config(),
      spreadsheet: book ? { id: book.getId(), name: book.getName(), url: book.getUrl() } : null,
      schema: schema,
      triggers: triggers,
      checkedAt: new Date().toISOString()
    };
  }
  return { names: names, currentName: currentName, config: config, configure: configure, spreadsheetId: spreadsheetId, health: health };
})();

function configureTrackerEnvironment(environment, spreadsheetId) {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('configure');
  return SheetFlowEnvironment.configure(environment, spreadsheetId);
}

function startupHealthCheck() {
  if (typeof SheetFlowAuth !== 'undefined') SheetFlowAuth.require('read');
  var book = getBook_();
  var result = SheetFlowEnvironment.health(book);
  if (!result.ok) throw new Error('SheetFlow startup health check failed: ' + JSON.stringify(result));
  return result;
}
