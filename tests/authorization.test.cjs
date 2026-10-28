const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness({ email = '', enforced = false, defaultRole = '' } = {}) {
  const properties = new Map(), reads = [];
  if (enforced) properties.set('SHEETFLOW_AUTH_ENFORCED', 'true');
  if (defaultRole) properties.set('SHEETFLOW_DEFAULT_ROLE', defaultRole);
  const context = vm.createContext({
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => { reads.push(key); return properties.get(key) || ''; },
      getProperties: () => { reads.push('*'); return Object.fromEntries(properties); },
      setProperty: (key, value) => properties.set(key, String(value))
    }) }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Authorization.js'), 'utf8'), context);
  return { auth: context.SheetFlowAuth, properties, reads };
}

test('owner-only mode keeps setup compatible when Google hides the active email', () => {
  const h = harness();
  assert.equal(h.auth.require('configure').role, 'administrator');
  assert.equal(h.auth.actor().authenticated, false);
});

test('enforced access requires identity and treats unknown users as viewers', () => {
  const anonymous = harness({ enforced: true });
  assert.throws(() => anonymous.auth.require('read'), /AUTH_IDENTITY_REQUIRED/);
  assert.throws(() => anonymous.auth.requireForEmail('write', 'unknown@example.com'), /AUTH_FORBIDDEN/);
  assert.equal(anonymous.auth.requireForEmail('read', 'unknown@example.com').role, 'viewer');
});

test('an administrator default never grants admin to an unmapped user under enforcement', () => {
  const h = harness({ email: 'unknown@example.com', enforced: true, defaultRole: 'administrator' });
  assert.equal(h.auth.actor().role, 'viewer');
  assert.throws(() => h.auth.require('configure'), /AUTH_FORBIDDEN/);
});

test('configured roles are checked per capability', () => {
  const h = harness({ email: 'editor@example.com', enforced: true });
  h.properties.set('SHEETFLOW_ROLE_editor@example.com', 'editor');
  assert.equal(h.auth.require('write').role, 'editor');
  assert.throws(() => h.auth.require('configure'), /AUTH_FORBIDDEN/);
});

test('role enforcement cannot be enabled before the deployment exposes an identity', () => {
  const h = harness();
  assert.throws(() => h.auth.setEnforced(true), /AUTH_IDENTITY_REQUIRED/);
  assert.equal(h.properties.has('SHEETFLOW_AUTH_ENFORCED'), false);
});

test('authorization uses one fresh snapshot and observes a role revocation on the next check', () => {
  const h = harness({ email: 'Editor@Example.com', enforced: true });
  h.properties.set('SHEETFLOW_ROLE_editor@example.com', 'editor');
  assert.equal(h.auth.require('write').email, 'editor@example.com');
  assert.deepEqual(h.reads, ['*']);
  h.properties.set('SHEETFLOW_ROLE_editor@example.com', 'viewer');
  assert.throws(() => h.auth.require('write'), /AUTH_FORBIDDEN/);
  assert.deepEqual(h.reads, ['*', '*']);
});

test('authorization observes enforcement changes without retaining an owner-only grant', () => {
  const h = harness({ email: 'unknown@example.com' });
  assert.equal(h.auth.require('write').role, 'administrator');
  h.properties.set('SHEETFLOW_AUTH_ENFORCED', 'true');
  assert.throws(() => h.auth.require('write'), /AUTH_FORBIDDEN/);
  assert.equal(h.auth.actor().role, 'viewer');
});
