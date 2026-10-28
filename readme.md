# SheetFlow

A Jira-style project tracker using **Google Sheets as its shared data source**, with an editable sheet view, a drag-and-drop Kanban board, and an interactive Gantt timeline. All three views use the same issues. No Jira account or paid frontend libraries are required.

## Project setup

Requires Node.js 20 or newer for the development tools and an installed Microsoft Edge for browser tests. The built app has no external runtime dependencies; Playwright is a development-only dependency.

Clone the repository and enter the project directory:

```sh
git clone https://github.com/martingrossman/gsheetjira.git
cd gsheetjira
```

Run the build and test checks before making changes:

```sh
npm ci
npm run check
```

Start the local browser demo:

```sh
npm start
```

Open **http://127.0.0.1:4173**. On Windows PowerShell with script execution disabled, use `npm.cmd` and `clasp.cmd` in place of `npm` and `clasp`.

You can also open `dist/index.html` directly, or upload that single file to an HTTPS static host. The standalone version starts with a clearly labeled sample project and saves changes in that browser's local storage. It does **not** sync to Google Sheets or other users. Browser storage can be cleared by the browser; export CSV to keep a portable copy. Use the Apps Script deployment below for shared storage.

Saved views capture the current filters, view, sort, visible columns, swimlane setting, and collapse state. They are personal to the current browser and do not sync to other users.

In **Sheet**, drag the dotted row grip to a row's **center** to make that row the new parent, or to an **Epic header** to move into that Epic. Drop at the **top/bottom quarter** of a row to insert before/after it and adopt its parent. A **Drop here to remove parent** target appears during non-Epic drags. Valid destinations highlight; invalid parent types, self-drops and cycles are blocked. Stories belong under Epics; Tasks/Bugs can also nest under other Tasks/Bugs. The Parent field/editor remains available as a keyboard alternative.

The up/down buttons and Alt + Up/Down keep the same parent and reorder siblings regardless of status. Drag moves switch column-sorted views to **Manual order**, expand the destination group, retain descendant links and preserve status, dates, dependencies and hidden siblings. Undo reverses the saved move. Inline Parent selects retain the current nested Task/Bug parent; the full editor lists all valid parent candidates and excludes self/descendants.

Direct views: `#sheet`, `#kanban`, and `#gantt` (or `?view=sheet`, `?view=kanban`, `?view=gantt`).

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Validate the JavaScript and generate `CoreScript.html` and `dist/index.html`. |
| `npm test` | Run the Node test suite. |
| `npm run check` | Run the build and Node test suite. |
| `npm run test:browser` | Build and run the isolated Playwright regression suite in Microsoft Edge. |
| `npm start` | Serve the standalone demo at `http://127.0.0.1:4173`. |
| `clasp show-file-status` | Compare local Apps Script files with the configured script project. |
| `clasp push` | Upload the Apps Script source files selected by `.claspignore`. |

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

The allowlist in `.claspignore` uploads the Apps Script runtime files: `Code.js`, `Core.js`, `CoreScript.html`, `Index.html`, `Styles.html`, `Client.html`, `QuickAdd.html`, `Schema.js`, `Migrations.js`, `Environment.js`, `Repository.js`, `History.js`, `Authorization.js`, `Settings.js`, `Ordering.js`, `Comments.js`, and `appsscript.json`. Tests, build scripts, `IMPLEMENTATION_PLAN.md`, and `dist/` are excluded.

Alternatively, open a Google Sheet, choose **Extensions → Apps Script**, and add those files manually. Add `Code.js` and `Core.js` as script files; Apps Script may display their extension as `.gs`. Keep all four HTML filenames exactly as shown, including the generated `CoreScript.html`. The project uses the V8 runtime.

### 2. Initialize the sheet

Run **`setupTracker`** in the Apps Script editor and approve Google's authorization prompt.

- In a spreadsheet-bound script, setup uses the bound spreadsheet.
- In a standalone script, setup creates a spreadsheet if no target is configured.
- To use a specific existing spreadsheet from a standalone script, first add a script property named **`SPREADSHEET_ID`** in **Project Settings → Script properties**. Use the ID from its URL.
- Setup creates and formats the legacy **Issues** tab plus the versioned v2 tabs, frozen headers, filtering, date/numeric validation, status colors, and overdue highlighting. Existing records are preserved. An Issues tab with different headers is rejected instead of overwritten.
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

If the tracker opens but reports **Cannot read properties of null (reading 'issues')**, run `startupHealthCheck` and `getProject` in the Apps Script editor. Successful editor execution does not verify browser transport: `google.script.run` rejects raw `Date` values, including nested timestamps. Current sources convert response timestamps to ISO strings and omit internal issue records. Upload the complete current sources, then reload `/dev`; for `/exec`, update the existing deployment to a new version before reloading. The browser now shows a connection diagnostic for a missing/invalid project response. Spreadsheet cells retain native date values.

### Schema v2 migration

The repository now includes a non-destructive schema migration. Run **SheetFlow → Check schema health**, then **Preview v2 migration**. Resolve every duplicate or invalid row before choosing **Migrate legacy Issues to v2 tabs**. Migration preserves IDs, hierarchy, and each full legacy record in `Legacy JSON`; repeated runs are safe when the targets still match the source. It leaves `Issues` intact.

Review the migration output in the test spreadsheet before choosing **SheetFlow → Activate v2 repository**. Activation compares source and target IDs, validates hierarchy, and routes app reads/writes through `Tasks` and `Projects and Epics`. The retained `Issues` tab is a migration snapshot while v2 is active. Direct v2 task/epic edits get defaults and validation notes. **Roll back to Issues repository** copies active v2 records back into `Issues`; if someone edits that legacy copy after rollback, activation stops until those changes are reconciled. This workflow has local mock coverage; run the migration and role smoke checks in a separate test workbook before using shared or production data.

## How it works

SheetFlow has one shared issue model and two storage adapters:

1. The browser demo loads sample issues into `localStorage`. It is useful for UI development and does not share data with other browsers or Google Sheets.
2. The Apps Script version calls server functions through `google.script.run`. It starts on `Issues` for compatibility. After an administrator completes and activates migration, the server reads and writes the versioned `Tasks` and `Projects and Epics` tabs. Both paths serialize dates, validate relationships, and use a script lock plus content versions.
3. `Core.js` contains the shared model and validation rules. `scripts/build.mjs` copies it into `CoreScript.html` for the browser and bundles the standalone `dist/index.html`.
4. `Index.html`, `Client.html`, and `Styles.html` provide the web app shell, views, interactions, and responsive styling. Apps Script serves the same client with the Google Sheets adapter enabled.
5. The three views render the same issue collection: Sheet for direct editing, Kanban for status and epic swimlanes, and Gantt for date scheduling. Filters and issue details are shared across views.

In the Kanban view, each epic is rendered as a horizontal swimlane containing the status columns. Lanes show item totals and completion percentage, can be collapsed, and remember their collapsed state in the browser. Dropping a card into another epic lane updates its parent relationship. Server-side atomic ordering, keyboard lane movement, dependency indicators, and WIP limits are not yet implemented.

## What you can do

- **Quick add:** use **SheetFlow → Quick add work item** for title-and-Enter creation with Task/Story/Epic selection, configured defaults, and optional Epic parent.
- **Paste list:** use **Paste list** to preview one Task title per line and submit up to 100 items. A pending batch is stored locally and can be retried with the same per-item operation IDs.

### Separate development, test, and production targets

The Apps Script project supports three explicit environment names: `development`, `test`, and `production`. Configure separate Apps Script projects and workbook IDs for each environment; environment names inside one script project alone do not isolate triggers or credentials. Configure the target spreadsheet from the Apps Script editor before running setup:

```js
configureTrackerEnvironment('test', 'TEST_SPREADSHEET_ID')
```

Use `configureTrackerEnvironment('production', 'PRODUCTION_SPREADSHEET_ID')` only in the production project. The spreadsheet ID is stored in an environment-specific script property, and server reads/writes use the selected environment. Existing projects continue to use the legacy `SPREADSHEET_ID` property as a fallback.

After setup, run **SheetFlow → Run startup health check**. It verifies the selected spreadsheet, schema tabs, and installed edit trigger. Keep the deployment owner-only until shared identity and role checks have been verified.

The active repository is stored per configured environment. V2 provides an append-only **Change History** log and `_System` idempotency receipts. App saves record created/updated events, and `getTaskHistory(id, limit, offset)` returns the newest events first. The browser supplies operation IDs for create, update, move, and quick-add retries; delete and comment mutations still need the same idempotency treatment.

### Authorization foundation

The server exposes `getTrackerActor`, `configureTrackerRole(email, role)`, and `setTrackerAuthorizationEnforced(true|false)`. Roles are `administrator`, `editor`, `viewer`, and `agent`; writes require editor/agent/admin, configuration requires admin, and acceptance is admin-only. Enforcement remains disabled by default for the owner-only deployment. When enabled, an unavailable Google identity is rejected, unmapped users are viewers (even if the configured default is administrator), and enabling enforcement requires an available active-user email. Verify this in the separate test deployment before sharing. This app role model does not override direct Google Sheets sharing permissions.

The migration seeds stable task-type settings (`algo`, `data`, `requirements`, and `bug`) plus default workflow values. Read them with `getTrackerSettings()` and update an existing setting with the administrator-only `updateTrackerSetting(id, value, active)` function. Type associations use stable IDs so labels can be renamed without rewriting task history.

The ordering foundation exposes `reorderIssue(id, beforeId, expectedVersion)`. It normalizes the affected status scope to stable rank gaps, checks the moved task revision, and records a reorder history event. The current board still uses its legacy client path; future table, board, and Gantt controls will call this shared operation.

- **Sheet:** edit cells directly, sort columns, and toggle all 21 fields. Click an issue ID to open the full editor. Native Google Sheets remains an editable source of truth.
- **Kanban:** view status columns grouped into epic swimlanes, collapse lanes, move cards through Backlog, To Do, In Progress, Review, and Done, and drop a card into another epic lane to reparent it. Drop on a card to insert before it; drop on a column header or empty area to append. Status is also editable in the issue drawer, including on touch devices.
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

For an **owner-only Google deployment**, run `enablePersonalTrackerMode` once from the Apps Script editor, then reload the tracker. Personal mode disables detailed history recording and automatic 45-second polling, skips custom role resolution when role enforcement is off, and loads comments when an issue opens. Use **Refresh** to see changes made in Google Sheets or another browser tab. Existing history is preserved. Run `enableTeamTrackerMode` and reload to resume history and polling; **team is the default** for projects without an explicit mode setting. Explicit server role enforcement takes precedence in either mode. Use team mode before sharing a deployment.

Personal mode speeds up ordinary **legacy Issues** saves with a Sheets values read and one atomic Sheets API batch containing the task, category change (when needed), and persistent retry receipt. The batch response verifies the written values; the ordinary personal save uses no `SpreadsheetApp.flush`. Dates remain native Sheet dates and formula-like text remains literal. The manifest enables the Advanced Sheets v4 service; a standard Google Cloud project also needs its Sheets API enabled. Personal legacy create-only batches now share this atomic writer. V2, edits submitted through the bulk-create API, moves, duplication, and other commands retain their existing storage paths with history suppressed in personal mode.

The isolated test deployment was switched to personal mode on 2026-10-28. Final live quick-create confirmations took **3.52, 2.51, and 3.47 seconds**, with cards appearing in **73–78 ms**. The two-second save target is still open. Live checks also verified dates, categories, literal text, persisted versions, and retry replay. Comments now load in the editor; Gantt comment previews use comments already loaded in this browser. Receipts remain persistent and unbounded; a retention policy is still future work.

Personal saves cache only workbook time zone, sheet IDs and grid sizes for 30 seconds. Tasks, receipts, permissions and headers remain fresh on each save. Opening/refreshing the project refreshes this metadata immediately; a rejected batch invalidates it before retry. Use **Refresh** after changing spreadsheet time zone or sheet structure. Values-only reads use the task/operational columns and return populated values, avoiding an extra last-row metadata request.

Further live checks on 2026-10-28 measured a metadata-only request (`getTrackerMode`, no spreadsheet access) at **1.12–1.47 seconds**. With warm metadata, three task acknowledgements took **2.98, 3.50, and 2.49 seconds** while handlers took **1.14, 1.72, and 1.30 seconds**. This reduced work in the workbook-opening stage but did not demonstrate a reliable improvement in total save latency. Apps Script request overhead and service variability remain material; instant confirmation is not promised.

App edits save to Sheets; detail text autosaves after a short pause and dates/selects save immediately. Client saves queue per issue while independent issues can save in parallel. A script lock serializes server writes. A content hash detects stale edits, including changes made directly in Sheets even if their timestamp has not changed. Failed saves keep a local draft and can be retried with the same operation ID. On a detected revision conflict, **Compare with latest** shows field differences and offers to load the latest copy; **Discard draft** removes the local copy after confirmation. Pasted batches keep per-item operation IDs across retries. Automatic merging is not implemented.

Kanban quick-add shows the new item immediately in its Epic/status column with **Saving…** or **Queued…**, while Sheets saves in the background. The form keeps its position, focus, next unsent title, and chosen kind across redraws; each swimlane retains its horizontal scroll. A failed or interrupted save keeps a **Save unconfirmed** card with **Retry save**, including after reload. Retry uses the original operation ID to check whether the server accepted the earlier request. Pending cards cannot be edited, dragged, or used as parents until the server returns a real issue ID.

Gantt's **＋** under an Epic or Story uses the same background queue. The new Story/Task appears immediately as a pending row under its parent. The popup clears the submitted title and stays open with its type selected, so you can enter the next item without waiting. Redraws retain the next title, cursor/focus, popup position and timeline scroll; adding in a long/collapsed Epic reveals the pending row using only the timeline's internal scroll. Repeated Enter on the cleared input creates no extra task. Failed/interrupted rows remain retryable after reload using their original operation ID. Pending rows acquire edit/drag/parent controls after Sheets confirms a real issue ID. The sync indicator announces completion only when all saves/queued entries have settled; retained unconfirmed drafts stay visible as unconfirmed.

A live Gantt Story check on 2026-10-28 showed its pending row in **44 ms** and Google confirmation in **3.89 seconds**, retaining the next title and focus throughout. This improves task entry while Google completes the save; it does not shorten the underlying Google request by that amount.

When you enter several items quickly, the first starts saving immediately. In personal legacy mode, groups of up to **20 waiting entries** then share one request, one fresh task/receipt read, and one atomic write. Each item retains its own operation ID; partial validation errors or a lost response leave only unconfirmed items retryable. The server advertises support with `quickBatchCreate`; older/team/v2 deployments retain the serial fallback. Paste-list create batches also use the optimized writer when eligible. Tasks and permissions remain fresh; each request reuses one local property snapshot, and saves hash only the edited task plus their returned data instead of hashing unrelated tasks. The write response includes only the fields needed for verification.

One same-session live comparison on 2026-10-28 created three Stories rapidly in Gantt: before these changes, confirmations arrived at **3.54 / 6.62 / 9.94 seconds**; afterward, at **1.90 / 3.78 / 3.78 seconds**. The final two items committed together. These are measured samples on the small test workbook, not guaranteed timings or proof of the 2,000-task performance target. All six temporary Stories were removed afterward.

The standard server save path reuses one fresh snapshot within the script lock, then verifies the saved row instead of rereading the entire register. V2 checks its schema once per save; task-type mappings and retry receipts share one operational-data read. Project refresh defers Comments until an issue opens. No snapshot is retained across requests. The regression fixture reduced v2 spreadsheet range reads from 48 to 13; this is an operation count, not a measured live-time speedup.

To diagnose remaining save latency, open **Apps Script → Executions**, select the latest `saveIssue` execution, and find the **`SheetFlow save timing`** log. It records lock wait, authorization, spreadsheet opening, reads, validation, task writes/flush, single-row verification, history/receipt writes/flush, and total handler time in milliseconds. Titles and descriptions are not logged. Browser/network transit and Apps Script startup before handler entry are outside `totalServerMs`. Live elapsed time must be measured separately; the timing log is also written for failures and retries.

The save journal resolves both output ranges before writing history and its retry receipt, avoiding an intervening metadata read that can flush queued writes. Authorization reads one fresh property snapshot per check, and repository selection reads only the environment name. Permission changes still apply to the next request. This follows Google's [batching guidance](https://developers.google.com/apps-script/guides/support/best-practices#use_batch_operations).

Live Playwright checks on the small legacy test workbook on 2026-10-28 confirmed the remaining delay: one baseline create took 5.07 seconds to acknowledge. After the journal/property changes, two creates took 5.04 and 3.51 seconds, with cards appearing in about 0.10 seconds. The server handlers took 3.16 and 2.17 seconds. These few samples show variable latency, not a guaranteed response time; the 2,000-task performance target remains unverified.

**Undo** reverses the most recent acknowledged edit, reorder, move, schedule change, bulk edit, or duplication from this browser. Close the issue editor before choosing Undo. Field and bulk changes require matching revisions and record the reversal as a new server change.

Duplication undo removes the complete copied tree only while every copy retains its original revision and no copy has received comments or new references from other issues. V2 archives the copies and records history; legacy storage and the local demo remove them. Originals stay intact. The undo command survives reloads and reuses its operation ID after an uncertain response. Even an edit subsequently reversed produces a new revision and prevents duplication undo. Create, paste-to-create batch, comment, and general archive/restore undo remain open. Apps Script data writes, history, and receipts are not transactional; failures while recording history/receipts still require refresh and review.

The cloud app refreshes every 45 seconds while visible and not editing, or immediately using **Refresh**. This is polling, not simultaneous live cursors. Native Sheet edits are not transactional with script writes. Avoid editing the same row at precisely the same time in Sheets and the web app.

Native Sheets dropdowns enforce basic types, statuses, priorities, dates, and numeric limits. Direct edits in `Issues`, and in `Tasks`/Epic rows after v2 activation, run through validation; invalid input stays visible with a row note. Generated IDs and revision fields are restored when a single-cell edit exposes the old value, and the v2 migration metadata also protects those fields during bulk edits. Settings/team/calendar cells still need their full validation workflow. While v2 is active, `Issues` is read-only; the trigger adds a note directing edits to the versioned tabs.

Dependencies are informational: the app prevents cyclic links but does not automatically shift successors or enforce dependency timing. Gantt windows show 56 days in day zoom or 112 in week zoom. Use the date picker to reach other periods.

## Development and verification

```sh
npm run check
```

This builds the standalone HTML, regenerates the browser model, syntax-checks browser/server JavaScript, and runs the Node suite. Tests cover migration repeatability/cutover/rollback, v2 repository CRUD and archive/restore, authorization rules, hierarchy/dependency cycles, dates, direct-edit validation, stale edits, row sorting, ID allocation, CSV escaping, and setup behavior. Server tests use an in-memory Apps Script service mock; they do not replace the separate live test-workbook smoke test.

Run the automated browser checks separately:

```sh
npm ci
npm run test:browser
```

`playwright.config.mjs` explicitly uses `channel: 'msedge'`. If Edge is missing, install it with `npx playwright install msedge` (`npx.cmd` in restricted PowerShell). The suite builds and serves the demo on port 4174, gives each test a fresh browser context and synthetic project, and covers duplication/undo, later edits/links/comments, lost-acknowledgement retry, and Sheet ordering through buttons, keyboard, and drag. Sheet checks include mixed statuses, column sorting, initial load/reload, Story children, undo, and hidden siblings. It never uses Google credentials or a live workbook. Failure traces appear in `test-results/`. The regression workflow runs the build, Node tests, and Edge tests on pushes and pull requests; GitHub execution is verified separately from local results.

The local browser workflow was also exercised for creation, Kanban dragging, inline sheet edits, Gantt dragging/resizing, persistence across reloads, filters, validation, CSV download, and mobile layouts. Live Google authorization, native Sheet formatting, and the deployed Apps Script runtime still need a smoke test after deployment.

Source layout:

```text
Code.js              Apps Script storage, setup, triggers, and web app entry points
PersonalBatch.js     Atomic personal-mode creation of queued and pasted items
QuickAdd.html        Google Sheets quick-add sidebar
Core.js              Shared model, validation, dates, CSV, and samples
CoreScript.html      Generated browser copy of Core.js; do not edit directly
Index.html           Apps Script page template
Styles.html          Responsive styles
Client.html          Views, editor, interactions, and persistence adapters
Schema.js            Versioned v2 tab and field definitions
Migrations.js        Schema health checks and legacy migration
Environment.js       Development/test/production spreadsheet selection
Repository.js        v2 task and reference storage helpers
History.js            Change history and idempotency records
Authorization.js     Actor and role capability checks
Settings.js           Configurable task types and workflow settings
Ordering.js           Server-side ordering foundation
Comments.js           Task comment storage
scripts/build.mjs    Dependency-free HTML build and syntax validation
scripts/serve.mjs    Local preview server
tests/               Model and mocked server tests
dist/index.html      Self-contained standalone browser demo
```

This is a Jira-style tracker; it does not connect to Atlassian Jira. The checked-in manifest preserves the current personal web-app settings (execute as the deploying user, accessible only to that user). Publishing to GitHub or building locally does not update Apps Script; use the deployment steps above to release future changes.
