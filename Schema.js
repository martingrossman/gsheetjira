/** Versioned SheetFlow schema metadata. The legacy Issues tab remains readable during migration. */
var SheetFlowSchema = (function () {
  'use strict';
  var version = '2.1';
  var tabs = {
    tasks: {
      name: 'Tasks',
      headers: ['ID', 'Kind', 'Task Type ID', 'Project ID', 'Epic ID', 'Parent Task ID', 'Title', 'Description', 'Acceptance Criteria', 'Status', 'Priority', 'Assignee ID', 'Reporter', 'Start Date', 'Due Date', 'Completed Date', 'Estimate (h)', 'Time Spent (h)', 'Progress (%)', 'Tags', 'Sprint', 'Dependencies', 'Repository URL', 'Branch', 'Pull Request URL', 'Agent Instructions', 'Verification Commands', 'Result Summary', 'Evidence Links', 'Blocker Reason', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Claimed By', 'Claimed At', 'Last Agent Activity', 'Revision', 'Archived At', 'Archived By', 'Legacy JSON', 'Order']
    },
    projects: {
      name: 'Projects and Epics',
      headers: ['ID', 'Entity Kind', 'Project ID', 'Title', 'Description', 'Owner ID', 'Start Date', 'Due Date', 'Order', 'Active', 'Archived At', 'Revision', 'Legacy JSON']
    },
    team: {
      name: 'Team',
      headers: ['ID', 'Kind', 'Display Name', 'Verified Identity', 'Role', 'Active', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Hours/Day', 'Agent Concurrency Limit', 'Stale Claim Threshold (h)', 'Default Assignee', 'Created At', 'Updated At']
    },
    availability: {
      name: 'Holidays and Availability',
      headers: ['ID', 'Scope Kind', 'Member ID', 'Kind', 'Start Date', 'End Date', 'Available Fraction', 'Available Hours', 'Reason', 'Created By', 'Created At', 'Updated At']
    },
    settings: {
      name: 'Settings',
      headers: ['ID', 'Category', 'Key', 'Value', 'Value Type', 'Active', 'Order', 'Updated At', 'Updated By']
    },
    history: {
      name: 'Change History',
      headers: ['Event ID', 'Operation ID', 'Entity Kind', 'Entity ID', 'Event Kind', 'Actor ID', 'Timestamp', 'Before Revision', 'After Revision', 'Changed Fields', 'Details']
    },
    comments: {
      name: 'Comments',
      headers: ['Comment ID', 'Task ID', 'Author ID', 'Body', 'Created At', 'Updated At', 'Edited By']
    },
    system: {
      name: '_System',
      headers: ['Key', 'Value', 'Updated At']
    }
  };
  function tabNames() { return Object.keys(tabs).map(function (key) { return tabs[key].name; }); }
  function headers(tab) { return tabs[tab].headers.slice(); }
  function report(book) {
    var result = { version: version, tabs: {}, missingTabs: [], schemaVersion: '' };
    var system = book.getSheetByName(tabs.system.name);
    if (system && system.getLastRow() > 1) {
      var rows = system.getRange(2, 1, system.getLastRow() - 1, 2).getValues();
      rows.forEach(function (row) { if (row[0] === 'SCHEMA_VERSION') result.schemaVersion = String(row[1]); });
    }
    tabNames().forEach(function (name) {
      var sheet = book.getSheetByName(name);
      result.tabs[name] = sheet ? { rows: Math.max(0, sheet.getLastRow() - 1), headersMatch: sheet.getLastRow() < 1 || sheet.getRange(1, 1, 1, tabs[Object.keys(tabs).find(function (key) { return tabs[key].name === name; })].headers.length).getValues()[0].join('|') === tabs[Object.keys(tabs).find(function (key) { return tabs[key].name === name; })].headers.join('|') } : null;
      if (!sheet) result.missingTabs.push(name);
    });
    result.ready = result.missingTabs.length === 0 && result.schemaVersion === version && Object.keys(result.tabs).every(function (name) { return result.tabs[name] && result.tabs[name].headersMatch; });
    return result;
  }
  return { version: version, tabs: tabs, tabNames: tabNames, headers: headers, report: report };
})();
