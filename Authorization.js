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
  function activeEmail() {
    var email = '';
    try { email = Session.getActiveUser().getEmail() || ''; } catch (ignore) {}
    return email;
  }
  function resolveActor(email, props) {
    var configured = email ? props['SHEETFLOW_ROLE_' + email.toLowerCase()] : '';
    // A missing email must never inherit administrator privileges once enforcement
    // is enabled. Personal, owner-only deployments remain compatible while the
    // enforcement switch is off.
    var enforcement = props.SHEETFLOW_AUTH_ENFORCED === 'true';
    var defaultRole = props.SHEETFLOW_DEFAULT_ROLE || (enforcement ? 'viewer' : 'administrator');
    if (enforcement && !configured && String(defaultRole).toLowerCase() === 'administrator') defaultRole = 'viewer';
    var role = String(configured || defaultRole).toLowerCase();
    if (roles.indexOf(role) < 0) role = 'viewer';
    return { id: email || 'owner-session', email: email, role: role, authenticated: Boolean(email) };
  }
  function actor() { return resolveActor(activeEmail(), PropertiesService.getScriptProperties().getProperties()); }
  function enforced() { return PropertiesService.getScriptProperties().getProperty('SHEETFLOW_AUTH_ENFORCED') === 'true'; }
  function requireCapability(capability, snapshot) {
    var props = snapshot || PropertiesService.getScriptProperties().getProperties();
    if (props.SHEETFLOW_MODE === 'personal' && props.SHEETFLOW_AUTH_ENFORCED !== 'true') {
      return { id: 'owner-session', email: '', role: 'administrator', authenticated: false };
    }
    return requireForEmail(capability, activeEmail(), props);
  }
  function requireForEmail(capability, email, snapshot) {
    email = String(email || '').trim().toLowerCase();
    // One fresh property snapshot per authorization check; never cache permissions between requests.
    var props = snapshot || PropertiesService.getScriptProperties().getProperties();
    var resolved = resolveActor(email, props), enforcement = props.SHEETFLOW_AUTH_ENFORCED === 'true';
    var allowed = capabilities[capability] || [];
    if (enforcement && !email) throw new Error('AUTH_IDENTITY_REQUIRED: Google did not provide the editor identity. Direct Sheet edits require a deployment that exposes the active editor.');
    if (enforcement && allowed.indexOf(resolved.role) < 0) throw new Error('AUTH_FORBIDDEN: ' + capability + ' requires an authorized role.');
    return resolved;
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
