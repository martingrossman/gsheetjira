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

test('a save context keeps workbook and repository selection consistent if configuration changes', () => {
  const C=require('../Core.js'),properties=new Map([['SHEETFLOW_ENV','test'],['SHEETFLOW_SPREADSHEET_ID_TEST','book-test'],['SHEETFLOW_SPREADSHEET_ID_PRODUCTION','book-production'],['SHEETFLOW_ACTIVE_SCHEMA_TEST','2']]),opened=[];
  const store={getProperty:key=>properties.get(key)||'',getProperties:()=>Object.fromEntries(properties)};
  const context=vm.createContext({TrackerCore:C,PropertiesService:{getScriptProperties:()=>store},SpreadsheetApp:{openById:id=>{opened.push(id);return {getSheetByName:()=>({getRange:()=>({getValues:()=>[C.fields.map(field=>field.label)]})})};}}});
  for(const file of ['Environment.js','Code.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context);
  const request=context.saveRequestContext_();
  properties.set('SHEETFLOW_ENV','production');
  context.getBook_(request.config);
  assert.equal(context.getRepositoryProperty_('SHEETFLOW_ACTIVE_SCHEMA',request.config),'2');
  context.getBook_();
  assert.deepEqual(opened,['book-test','book-production']);
});
