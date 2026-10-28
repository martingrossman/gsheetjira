const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('repository property names follow fresh environment selection without loading full configuration', () => {
  const properties = new Map([['SHEETFLOW_ENV', 'test']]), reads = [];
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => { reads.push(key); return properties.get(key) || ''; } }) },
    ScriptApp: { getScriptId: () => { throw new Error('Full config is unnecessary for a property key'); } }
  });
  for (const file of ['Environment.js', 'Code.js']) vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  assert.equal(context.repositoryPropertyKey_('SHEETFLOW_ACTIVE_SCHEMA'), 'SHEETFLOW_ACTIVE_SCHEMA_TEST');
  assert.deepEqual(reads, ['SHEETFLOW_ENV']);
  properties.set('SHEETFLOW_ENV', 'production');
  assert.equal(context.repositoryPropertyKey_('SHEETFLOW_ACTIVE_SCHEMA'), 'SHEETFLOW_ACTIVE_SCHEMA_PRODUCTION');
  properties.set('SHEETFLOW_ENV', 'invalid');
  assert.equal(context.repositoryPropertyKey_('SHEETFLOW_ACTIVE_SCHEMA'), 'SHEETFLOW_ACTIVE_SCHEMA_DEVELOPMENT');
});
