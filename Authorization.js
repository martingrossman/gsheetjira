/** Server-side actor and capability checks for shared deployments. */
var SheetFlowAuth = (function () {
  'use strict';
  var roles = ['administrator', 'editor', 'viewer', 'agent'];
  var capabilities = {
    read: ['administrator', 'editor', 'viewer', 'agent'],
    write: ['administrator', 'editor', 'agent'],
    configure: ['administrator'],
    accept: ['administrator'],
    agentWorkflow: ['administrator', 'agent']
  };
  function actor() {
    var email = '';
    try { email = Session.getActiveUser().getEmail() || ''; } catch (ignore) {}
    var props = PropertiesService.getScriptProperties();
    var configured = email ? props.getProperty('SHEETFLOW_ROLE_' + email.toLowerCase()) : '';
    // A missing email must never inherit administrator privileges once enforcement
    // is enabled. Personal, owner-only deployments remain compatible while the
    // enforcement switch is off.
    var defaultRole = props.getProperty('SHEETFLOW_DEFAULT_ROLE') || (enforced() ? 'viewer' : 'administrator');
    if (enforced() && !configured && String(defaultRole).toLowerCase() === 'administrator') defaultRole = 'viewer';
    var role = String(configured || defaultRole).toLowerCase();
    if (roles.indexOf(role) < 0) role = 'viewer';
    return { id: email || 'owner-session', email: email, role: role, authenticated: Boolean(email) };
  }
  function enforced() { return PropertiesService.getScriptProperties().getProperty('SHEETFLOW_AUTH_ENFORCED') === 'true'; }
  function requireCapability(capability) {
    return requireForEmail(capability, actor().email);
  }
  function requireForEmail(capability, email) {
    email = String(email || '').trim().toLowerCase();
    var props = PropertiesService.getScriptProperties();
    var configured = email && props.getProperty('SHEETFLOW_ROLE_' + email);
    var defaultRole = props.getProperty('SHEETFLOW_DEFAULT_ROLE') || (enforced() ? 'viewer' : 'administrator');
    if (enforced() && !configured && String(defaultRole).toLowerCase() === 'administrator') defaultRole = 'viewer';
    var role = String(configured || defaultRole).toLowerCase();
    if (roles.indexOf(role) < 0) role = 'viewer';
    var allowed = capabilities[capability] || [];
    if (enforced() && !email) throw new Error('AUTH_IDENTITY_REQUIRED: Google did not provide the editor identity. Direct Sheet edits require a deployment that exposes the active editor.');
    if (enforced() && allowed.indexOf(role) < 0) throw new Error('AUTH_FORBIDDEN: ' + capability + ' requires an authorized role.');
    return { id: email || 'owner-session', email: email, role: role, authenticated: Boolean(email) };
  }
  function configure(email, role) {
    email = String(email || '').trim().toLowerCase(); role = String(role || '').toLowerCase();
    if (!email || roles.indexOf(role) < 0) throw new Error('Provide an email and one of: ' + roles.join(', ') + '.');
    requireCapability('configure');
    PropertiesService.getScriptProperties().setProperty('SHEETFLOW_ROLE_' + email, role);
    return { email: email, role: role };
  }
  function setEnforced(value) {
    requireCapability('configure');
    if (value && !actor().email) throw new Error('AUTH_IDENTITY_REQUIRED: verify an accessing-user deployment before enabling role enforcement.');
    PropertiesService.getScriptProperties().setProperty('SHEETFLOW_AUTH_ENFORCED', value ? 'true' : 'false');
    return { enforced: Boolean(value) };
  }
  return { roles: roles, actor: actor, require: requireCapability, requireForEmail: requireForEmail, configure: configure, setEnforced: setEnforced, enforced: enforced };
})();

function configureTrackerRole(email, role) { return SheetFlowAuth.configure(email, role); }
function setTrackerAuthorizationEnforced(value) { return SheetFlowAuth.setEnforced(value); }
function getTrackerActor() { return SheetFlowAuth.actor(); }
