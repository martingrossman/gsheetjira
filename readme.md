# SheetFlow

A Jira-style project tracker using **Google Sheets as its shared data source**, with an editable sheet view, a drag-and-drop Kanban board, and an interactive Gantt timeline. All three views use the same issues. No Jira account or paid frontend libraries are required.

## Try it locally

Requires Node.js 18 or newer. There are no npm dependencies to install.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4173**. On Windows PowerShell with script execution disabled, use `npm.cmd` and `clasp.cmd` in place of `npm` and `clasp`.

You can also open `dist/index.html` directly, or upload that single file to an HTTPS static host. The standalone version starts with a clearly labeled sample project and saves changes in that browser's local storage. It does **not** sync to Google Sheets or other users. Browser storage can be cleared by the browser; export CSV to keep a portable copy. Use the Apps Script deployment below for shared storage.

Direct views: `#sheet`, `#kanban`, and `#gantt` (or `?view=sheet`, `?view=kanban`, `?view=gantt`).

## Publish the standalone version on GitHub Pages

This repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. Push to `main`, then open **Settings → Pages** and choose **GitHub Actions** as the source if GitHub asks you to configure Pages. The workflow builds `dist/index.html` and publishes it at:

```text
https://martingrossman.github.io/gsheetjira/
```

GitHub Pages is the portable browser demo: it stores changes in that browser's local storage. It cannot call `google.script.run`, so it does not share data with the Google Sheet. Use the Apps Script web-app URL below when you need shared Google Sheets storage; both versions use the same project model and views.

## Deploy the shared Google Sheets version

### 1. Upload the Apps Script files

This checkout retains the existing script ID in `.clasp.json`. Verify that this is your intended Apps Script project before pushing.

```sh
npm run build
clasp login
clasp show-file-status
clasp push
```

The allowlist in `.claspignore` uploads only `Code.js`, `Core.js`, `CoreScript.html`, `Index.html`, `Styles.html`, `Client.html`, and `appsscript.json`. Tests, build scripts, and `dist/` are excluded.

Alternatively, open a Google Sheet, choose **Extensions → Apps Script**, and add those files manually. Add `Code.js` and `Core.js` as script files; Apps Script may display their extension as `.gs`. Keep all four HTML filenames exactly as shown, including the generated `CoreScript.html`. The project uses the V8 runtime.

### 2. Initialize the sheet

Run **`setupTracker`** in the Apps Script editor and approve Google's authorization prompt.

- In a spreadsheet-bound script, setup uses the bound spreadsheet.
- In a standalone script, setup creates a spreadsheet if no target is configured.
- To use a specific existing spreadsheet from a standalone script, first add a script property named **`SPREADSHEET_ID`** in **Project Settings → Script properties**. Use the ID from its URL.
- Setup creates and formats an **Issues** tab with 21 columns, frozen headers, filtering, date/numeric validation, status colors, and overdue highlighting. Other tabs are preserved. An existing Issues tab with different headers is rejected instead of overwritten.
- Setup installs an edit trigger so typing or pasting issues directly in Sheets assigns IDs, fills defaults, and updates timestamps. Run setup once as the project owner. A bound script also provides a **SheetFlow** menu when the spreadsheet reopens.
- The spreadsheet URL appears in the execution log and setup's return value. The deployed app also provides an **Open Google Sheet** link.

For a demo inside Google Sheets, run **`loadSampleData`** after setup. This only works if Issues contains no data. Production sheets start empty unless you explicitly load samples.

### 3. Create a web app deployment

In Apps Script, choose **Deploy → New deployment → Web app**.

For a shared team sheet, use **Execute as: User accessing the web app**, grant those users edit access to the spreadsheet, and restrict web-app access to the intended people or organization using the options available to your Google account. Each user authorizes the script. For a personal deployment, use **Execute as: Me** and **Who has access: Only myself**.

Copy the deployment's `/exec` URL. It serves all three interactive views:

```text
YOUR_WEB_APP_URL?view=sheet
YOUR_WEB_APP_URL?view=kanban
YOUR_WEB_APP_URL?view=gantt
```

Google documents deployment and execution identities in its [web app guide](https://developers.google.com/apps-script/guides/web). The frontend uses the supported [google.script.run API](https://developers.google.com/apps-script/guides/html/communication), so Sheets writes run inside the Apps Script deployment. A separately hosted static HTML file does not use this API.

After source changes, rebuild, push, then **Deploy → Manage deployments → Edit → New version → Deploy**. Pushing alone does not update a versioned production deployment.

### Schema v2 migration

The repository now includes a non-destructive schema migration foundation. After pushing the new Apps Script files, run **SheetFlow → Check schema health**, then **SheetFlow → Preview v2 migration**. Resolve every duplicate or invalid legacy row reported by the dry run before choosing **Migrate legacy Issues to v2 tabs**. The migration creates versioned `Tasks`, `Projects and Epics`, `Team`, `Holidays and Availability`, `Settings`, `Change History`, and `_System` tabs, preserves legacy IDs and values, and leaves the original `Issues` tab intact for rollback and comparison.

## What you can do

### Separate development, test, and production targets

The Apps Script project supports three explicit environment names: `development`, `test`, and `production`. Configure the target spreadsheet from the Apps Script editor before running setup:

```js
configureTrackerEnvironment('test', 'TEST_SPREADSHEET_ID')
```

Use `configureTrackerEnvironment('production', 'PRODUCTION_SPREADSHEET_ID')` only in the production project. The spreadsheet ID is stored in an environment-specific script property, and server reads/writes use the selected environment. Existing projects continue to use the legacy `SPREADSHEET_ID` property as a fallback.

After setup, run **SheetFlow → Run startup health check**. It verifies the selected spreadsheet, schema tabs, and installed edit trigger. Keep the deployment owner-only until shared identity and role checks have been verified.

The v2 tabs also provide an append-only **Change History** log and `_System` idempotency receipts. App saves record created/updated events when the migration tabs exist, and `getTaskHistory(id, limit, offset)` returns the newest events first. `saveIssue` accepts an optional operation ID so a caller can safely reuse it after an ambiguous timeout.

### Authorization foundation

The server now exposes `getTrackerActor`, `configureTrackerRole(email, role)`, and `setTrackerAuthorizationEnforced(true|false)`. Roles are `administrator`, `editor`, `viewer`, and `agent`; writes require editor/agent/admin, configuration requires admin, and acceptance is admin-only. Enforcement is disabled by default to preserve the existing owner-only deployment. Configure roles and verify the active identity in the test deployment before enabling it for shared access.

The migration seeds stable task-type settings (`algo`, `data`, `requirements`, and `bug`) plus default workflow values. Read them with `getTrackerSettings()` and update an existing setting with the administrator-only `updateTrackerSetting(id, value, active)` function. Type associations use stable IDs so labels can be renamed without rewriting task history.

The ordering foundation exposes `reorderIssue(id, beforeId, expectedVersion)`. It normalizes the affected status scope to stable rank gaps, checks the moved task revision, and records a reorder history event. The current board still uses its legacy client path; future table, board, and Gantt controls will call this shared operation.

- **Sheet:** edit cells directly, sort columns, and toggle all 21 fields. Click an issue ID to open the full editor. Native Google Sheets remains an editable source of truth.
- **Kanban:** move cards through Backlog, To Do, In Progress, Review, and Done. Drop on a card to insert before it; drop on a column header or empty area to append. Status is also editable in the issue drawer, including on touch devices.
- **Gantt:** drag a bar to shift start and due dates together; resize its right edge to change the due date. Use Today, previous/next windows, a start-date picker, or day/week zoom. Bars display progress, with dashed lines for dependencies. Unscheduled issues stay visible with a link to set dates; issues outside the window show their date range.
- **Hierarchy:** epics contain stories; tasks and bugs can belong to epics or stories. Standalone issues are allowed. Click an epic in the sidebar to include all its descendants.
- **Issue editor:** create, edit, or delete issues, with descriptions, assignees, priorities, sprints, labels, estimates, time spent, progress, and dependencies. Deletion is blocked while another issue references the item as a parent or dependency.
- **Filters:** search text and filter by type, assignee, status, sprint, or epic across every view. Statistics reflect the filtered issues. Totals count records, including epics; they are not sums of child estimates.
- **CSV:** export the filtered issues with all fields. Formula-like text is neutralized for spreadsheet imports. CSV import is not included.
- **Shortcuts:** `1` Sheet, `2` Kanban, `3` Gantt, `/` search, `N` new issue, `Esc` close editor. Shortcuts are inactive while typing.

## Sheet columns

Keep the header names and order intact. IDs are stable keys: do not change them once referenced.

| Column | Field | Meaning |
| --- | --- | --- |
| A | ID | Generated `PRJ-1`, `PRJ-2`, etc. |
| B | Type | Epic, Story, Task, Bug |
| C | Parent ID | Optional parent issue ID |
| D | Summary | Required, up to 250 characters in the app |
| E | Description | Context, acceptance criteria, and links as text |
| F | Status | Backlog, To Do, In Progress, Review, Done |
| G | Priority | Highest, High, Medium, Low, Lowest |
| H | Assignee | Name or email; blank means unassigned |
| I | Reporter | Name or email |
| J | Start Date | Optional date, displayed as YYYY-MM-DD |
| K | Due Date | Optional date, on or after start |
| L | Completed Date | Generated when moving to Done; cleared on reopening |
| M | Estimate (h) | Nonnegative hours |
| N | Time Spent (h) | Nonnegative hours |
| O | Progress (%) | 0–100; Done sets 100; reopening a completed issue resets 100 to 0 |
| P | Labels | Comma-separated text |
| Q | Sprint | Optional sprint name |
| R | Dependencies | Comma-separated existing issue IDs; cycles prohibited in the app |
| S | Created At | Generated timestamp |
| T | Updated At | Generated timestamp |
| U | Order | Numeric board sort order; normally managed by the app |

Dates and timestamps are stored as real date values in Google Sheets. The app exchanges date-only strings to avoid timezone shifts. Spreadsheet date conversion uses the spreadsheet's timezone; the manifest retains the existing Europe/Prague script timezone. Estimates and progress are recorded per issue and do not automatically roll up to parents.

To add issues directly in Sheets, enter or paste a **Summary** in column D and fill the fields you need. The edit trigger fills IDs and defaults. Keep generated ID, completion date, timestamp, and order columns intact. Pasting via an external API does not fire Google's edit trigger; supply complete rows or use the app instead. See Google's [installable trigger documentation](https://developers.google.com/apps-script/guides/triggers/installable).

## Saving and collaboration

App edits save immediately to Sheets. A script lock serializes app writes. A content hash detects stale edits, including changes made directly in Sheets even if their timestamp has not changed. On conflict, the app retains your open form and tells you to refresh before trying again. Copy unsaved text before closing and reopening the editor to load the newest issue.

The cloud app refreshes every 45 seconds while visible and not editing, or immediately using **Refresh**. This is polling, not simultaneous live cursors. Native Sheet edits are not transactional with script writes. Avoid editing the same row at precisely the same time in Sheets and the web app.

Native Sheets dropdowns enforce basic types, statuses, priorities, dates, and numeric limits. Cross-row hierarchy and dependency checks run on web-app saves; manual Sheets edits can bypass them. Keep references valid and due dates on or after start. Duplicate IDs and altered headers produce explicit load errors.

Dependencies are informational: the app prevents cyclic links but does not automatically shift successors or enforce dependency timing. Gantt windows show 56 days in day zoom or 112 in week zoom. Use the date picker to reach other periods.

## Development and verification

```sh
npm run check
```

This builds the standalone HTML, regenerates the browser model, syntax-checks browser/server JavaScript, and runs 28 Node tests. Tests cover hierarchy, dependency cycles, dates, completion/reopening, CSV escaping, sheet serialization, stale edits, row sorting, ID allocation, direct multirow pastes, safe deletion, and setup with non-chainable frozen-pane setters. Re-running setup is tested to preserve issues and reuse the existing spreadsheet and edit trigger. Server tests use an in-memory Apps Script service mock.

The local browser workflow was also exercised for creation, Kanban dragging, inline sheet edits, Gantt dragging/resizing, persistence across reloads, filters, validation, CSV download, and mobile layouts. Live Google authorization, native Sheet formatting, and the deployed Apps Script runtime still need a smoke test after deployment.

Source layout:

```text
Code.js            Apps Script storage, setup, triggers, and web app
Core.js            Shared model, validation, dates, CSV, and samples
CoreScript.html    Generated browser copy of Core.js; do not edit directly
Index.html         Apps Script page template
Styles.html        Responsive styles
Client.html        Views, editor, interactions, and persistence adapters
scripts/build.mjs  Dependency-free HTML build and syntax validation
scripts/serve.mjs  Local preview server
tests/             Model and mocked server tests
dist/index.html    Self-contained standalone browser demo
```

This is a Jira-style tracker; it does not connect to Atlassian Jira. The checked-in manifest preserves the current personal web-app settings (execute as the deploying user, accessible only to that user). Publishing to GitHub or building locally does not update Apps Script; use the deployment steps above to release future changes.
