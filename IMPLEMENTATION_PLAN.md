# Implementation review and completion plan

Reviewed: 2026-10-27. Baseline: commit `420b8e5`, against [ProductRequiremtns.md](ProductRequiremtns.md), including section 4.1 on vertical reordering.

## 1. Review outcome

The current application provides a working foundation for a personal tracker: a Google Sheets issue register, editable HTML table, Kanban columns, Gantt scheduling, issue details, basic filters, CSV export, and conflict detection for app writes. It does not yet implement the full team and agent task manager described in the requirements.

The largest changes are a migration from the single `Issues` table to the required data model, a common mutation and permissions layer, consistent ordering across views, faster editing, and the missing team, calendar, settings, dashboard, and agent workflows. Build these in that order so later features share the same rules and persistence.

**Verification performed for this review:** inspected the source, build/deployment configuration, README, and test files; ran `npm.cmd test`: **28 tests passed**. These are model and mocked Apps Script tests. No live spreadsheet operations, fresh browser interaction tests, concurrency load tests, or 2,000-task benchmarks were run for this review. Previous manual browser testing is documented in the README, but there is no committed automated browser suite.

This document is a plan. The proposed features, schemas, modules, and acceptance checks below are not implemented by adding this file.

### Status definitions

- **Implemented:** the named capability exists in the inspected code; this does not imply every requirement in its section is complete.
- **Partial:** a useful subset exists, but behavior, coverage, or verification is missing.
- **Missing:** no implementation was found in the current source.

## 2. Findings to address first

| Priority | Finding and evidence | Consequence | Planned resolution |
|---|---|---|---|
| P0 | Failed inline saves call `render()` using the old issue state in [Client.html](Client.html), change handler near line 328. The detail form preserves its text, but table cells do not. | A network error or conflict can discard the value the user just typed. | WP-03: preserve drafts per issue/field, provide Retry and conflict resolution, and test failure after typing. |
| P0 | `handleSheetEdit()` in [Code.js](Code.js), line 99, fills IDs/defaults/timestamps without calling the domain validator. `readIssues_()` checks only some invalid data and throws for the entire load. | Direct edits can introduce invalid relationships, date ranges, and dependencies; a malformed row can block the application. | WP-02: validate and reconcile native edits, protect controlled fields, retain invalid input with diagnostics, and keep unaffected records usable. |
| P0 | `type` is hardcoded to Epic/Story/Task/Bug and `parentId` overloads hierarchy in [Core.js](Core.js), lines 4–15 and `validate()`. | The required configurable task categories, project/epic links, and task-under-task subtasks cannot be represented correctly. | WP-01/WP-04: distinguish hierarchy kind from configurable task type and migrate links without changing existing IDs. |
| P0 before team/agent release | [appsscript.json](appsscript.json) is owner-only; server entry points have no application roles or actor checks. | The current personal deployment is not a team or agent authorization system. Broadening access alone would not satisfy the requirements. | WP-00/WP-02/WP-10: verify identity, enforce server permissions, and prove the authenticated agent transport before enabling shared access. |
| P1 | `persist()` waits for the server before updating state, and `setBusy()` blocks editing globally in [Client.html](Client.html), lines 88–123. | Routine edits are tied to network latency; the required immediate feedback and background saving are absent. | WP-03: optimistic state, a per-record mutation queue, debounce, explicit pending/failure states, and targeted rendering. |
| P1 | Kanban computes midpoint ranks in the browser and saves only the moved record; there is no group revision or rank rebalance. See [Client.html](Client.html), drop handler near line 346. | Concurrent moves can choose the same rank; repeated insertions can exhaust numeric gaps. Sheet/Gantt rows and epic groups cannot be dragged vertically. | WP-05: one server ordering operation, ordering-scope revisions, safe rebalance, and shared drag/keyboard controls. |
| P1 | App create calls have no idempotency key; history and undo are absent. [Code.js](Code.js), `saveIssue()` and `deleteIssue()`. | Retrying a create after a lost response can duplicate work, and edits/deletions have no durable recovery trail. | WP-02/WP-03: operation IDs, history, archive/restore, and revision-checked inverse operations. |
| P1 | Every save reads the whole register, writes a full row, then reads the whole register again. Reads also acquire the script lock. Rendering rebuilds all visible content. | The stated 2,000-task performance targets have not been demonstrated and these paths will need measurement and optimization. | WP-02/WP-14: batched reads/writes, changed-field updates, summary/detail loading, bounded critical sections, and rendering virtualization. |

## 3. Requirements coverage

Work-package references point to section 6. Optional features in the requirements remain included in the plan; optional means configurable, not omitted.

| Requirement section | Current coverage | Missing or incomplete behavior | Work packages |
|---|---|---|---|
| 1. Purpose | Partial: human tracker with three views over shared data. | Full dashboard and agentic coding workflow; fast-entry performance. | WP-03, WP-09, WP-10, WP-14 |
| 2. Architecture | Implemented: Apps Script/HTML/Sheets, direct editing, stable IDs, Git. Partial: full-page views. | Sheets quick-entry sidebar; six required tabs; separate development/test spreadsheet and script configuration. `openTracker()` currently opens a small link dialog, not an entry sidebar. | WP-00, WP-01, WP-03 |
| 3. Task data model | Partial: 21 fixed issue columns, dates, hours, labels, parent links, timestamps, content-hash version, numeric order. | Projects, separate epic/subtask references, configurable task types/defaults, required workflow enums, agent/coding/evidence/actor/claim fields. See field mapping below. | WP-01, WP-02, WP-04, WP-10 |
| 4. Fast creation/editing | Implemented: title-only creation through a form, table inline edits, detail panel, save indicators, some shortcuts. | Always-visible title + Enter creation; detail autosave; optimistic updates; failed-cell draft retention; multiline app paste; bulk edits; duplication; templates; undo; full keyboard navigation. | WP-03, WP-06, WP-13 |
| 4.1. Vertical reordering | Partial: flat Kanban cards, including epic cards, can move vertically and persist `rank`. Sheet/Gantt initially consume rank order. | Vertical table/Gantt row moves, epic group moves, scope-aware consistency, keyboard Move up/down, undo, filtered/sorted behavior, concurrent ordering checks. Moving an epic card currently does not move its children as a group; the epic sidebar also ignores rank. | WP-05, WP-07, WP-11 |
| 5. Task list | Implemented: editable table, search, one-column sorting, detail links. Partial: columns and filters. | Per-column configuration rather than primary/all toggle; grouping; saved views; subtask tree; project/priority/tag/date filters; blocked/overdue/unassigned row highlighting; repository/branch/PR links. | WP-01, WP-06, WP-10 |
| 6. Kanban | Implemented: status columns, drag moves/reorder, card fields and fixed kind icons. Partial: Add issue opens a form; keyboard opens cards. | Inline column creation; dependency/blocker indicators; configurable WIP limits; keyboard movement and ordering; configurable badges and new statuses. | WP-03, WP-04, WP-05, WP-07 |
| 6.1. Epic swimlanes | Missing: epic sidebar filtering is not swimlane grouping. | Epic/assignee/project grouping; aligned columns; collapse/expand; No epic lane; atomic cross-column/cross-epic moves; epic totals and completion; vertical lane order. | WP-05, WP-07 |
| 6.2. Filters | Partial: one type, status, assignee, sprint and one epic; reset; combined search; state survives view switches in the same session. | Multi-type selection; saved filters/grouping; persisted views; stronger active-filter display. | WP-04, WP-06 |
| 7. Gantt | Implemented: day/week scales, horizontal move, right-edge resize, calendar-day duration preservation, progress, dependency lines, today and weekend markers. | Month zoom, milestones, holiday/leave/overdue overlays, separate unscheduled tray and drop-to-schedule, grouping, vertical order, conflict warnings, optional propagation, scheduling undo, working-day mode and explicit overrides. | WP-05, WP-08, WP-11, WP-12 |
| 8. Team/capacity | Missing: assignees are unvalidated text names. | Team tab; stable people/agent identities; roles, active status, workweek, hours/day, default assignees; history-preserving deactivation; workload and overload; availability; agent concurrency limits. | WP-01, WP-02, WP-08, WP-10, WP-12 |
| 9. Holidays/availability | Missing: only fixed Saturday/Sunday styling exists. | Manual holidays and leave; single/range/partial days; team/individual scope; configurable workweeks; scheduling and workload integration; preserved overrides. | WP-08, WP-11, WP-12 |
| 10. Types/settings | Missing as configuration: enums, colors and defaults are hardcoded. | Settings UI/tab; stable type IDs; Algo/Data/Requirements/Bug defaults; name/color/badge/order/active/default configuration; safe rename, deactivate, and delete-with-reassignment. | WP-04 |
| 11. Attributes/badges | Partial: fixed kind icons, colors and type tooltip; symbols supplement color. | Typed custom attributes; selectable value styling; configured primary badge source; initials/custom abbreviation/icon; focus-accessible full label; shared renderer including dashboard; measured contrast. | WP-04, WP-13 |
| 12. Dashboard | Partial: four non-clickable counters for total/in-progress/completed/overdue. | Dedicated dashboard route; breakdowns by status/epic/type/assignee; blocked/due-soon/review/stale-claim lists; epic progress; workload warnings; task badges; filter-preserving drill-down and project filtering. | WP-09, WP-10, WP-12 |
| 13. Agent workflow | Missing. | Structured context; ready-task listing; claim/progress/block/release/reassign/subtask/result operations; stale claims; dependency start guard; evidence validation; separate completion and acceptance; permission boundary for task content. | WP-01, WP-02, WP-10 |
| 13.1. Status flow | Partial: Backlog → To Do → In Progress → Review → Done labels exist without transition policy. | Ready migration, Blocked/reason/explicit return status, reviewer-controlled acceptance, evidence requirements, and agent start rules. | WP-01, WP-02, WP-10 |
| 14. Agent interface | Missing: browser `google.script.run` CRUD is not a documented authenticated agent API. | All nine named operations, JSON contract, pagination/filtering/batches, verified actor identity, revisions, idempotency, structured errors, credential lifecycle. | WP-00, WP-02, WP-10 |
| 15. Integrity/concurrency | Implemented for app CRUD: script lock, content versions, stable links, dependency-cycle checks, linked-delete guard. Partial overall. | Task-parent cycles once subtasks exist; claim/bulk/multi-entity atomicity; consistent direct-sheet validation; reconciliation; archival; order-group conflicts; same-row manual edit race handling. | WP-01, WP-02, WP-05, WP-10 |
| 16. Performance | Partial: client reuses loaded data, bulk reads, no full browser reload, loading states; text cells save on change rather than each keystroke. | Changed-field writes; batched trigger writes; reference caching; debounced autosave; incremental/virtual rendering; measured 100 ms / 3 s / 2 s targets at 2,000 tasks. | WP-02, WP-03, WP-14 |
| 17. Reliability/history | Partial: errors and conflict detection; editor drafts survive failure; load retry; CSV export. | Durable actor/field history, claims/review events, history panel, failed-save retry, duplicate-safe operations, backups/restoration, archive, documented undo scope. CSV alone is not a project backup. | WP-02, WP-03, WP-10, WP-14 |
| 18. Access control | Partial: personal Google deployment gate; escaped HTML and formula-like text handling. | Admin/editor/viewer/agent roles; reviewer capability; Settings permissions; server checks on every operation; sheet protections and direct-access policy; per-actor audit; authenticated agent secrets. | WP-00, WP-02, WP-10 |
| 19. Development/verification | Implemented: separate core/server/client files, generated browser core, build script, setup docs, 28 tests. | Environment separation; committed browser tests; live Apps Script acceptance; migration, role, bulk, order, calendar, claim, API, retry and load coverage; deployment manifest/allowlist updates for new modules. | WP-00 and verification in every package; WP-14 |
| 20. Delivery priorities | Partial personal tracker foundation. | Complete Phase 1 human + agent MVP, then scheduling/capacity, then extended customization/reporting. Earlier Gantt work is reusable but does not make Phase 2 complete. | Release sequence in section 7 |

## 4. Proposed data model and migration

### 4.1 Required workbook structure

Comments are append-only task activity records with stable comment IDs, task ID, author, created/updated timestamps, body text, and edit metadata. The detail editor shows the full comment thread; Kanban and Gantt provide a compact add-comment action; card/row hover previews the three newest comment lines without replacing the task description.

| Tab | Records and ownership |
|---|---|
| `Tasks` | One row per task/story/subtask. Stable IDs and explicit relationships; business fields remain visible and editable according to sheet permissions. |
| `Projects and Epics` | One row per project or epic, distinguished by entity kind. Stable IDs, project link for epics, title, description, owner, dates, manual order, revision, active/archive state. |
| `Team` | Stable member ID, human/agent kind, verified identity mapping, role/capabilities, active flag, working-day pattern, daily capacity, agent concurrency limit. Protect security-related columns. |
| `Holidays and Availability` | Stable record ID, team/member scope, holiday/leave/override kind, start/end dates, unavailable fraction or explicit available hours, reason. |
| `Settings` | Typed configuration records: workflow/defaults, task types, custom attribute definitions/options, badge source, WIP limits, views, templates, project defaults, schema version and ordering configuration. |
| `Change History` | Append-only accepted changes and workflow events, with event/operation IDs, actor, source, entity ID, timestamp, before/after revisions and changed values. |

Add a protected internal `_System` tab only for operational records that do not belong in the six user-facing tabs: idempotency receipts, ordering-scope revisions and last-accepted row snapshots for direct-edit reconciliation. Bound record sizes and define retention; do not put credentials here. Task fields remain in plain columns, not a single JSON task blob.

### 4.2 Field mapping and additions

#### Orthogonal hierarchy and activity type

`Kind` and `Task Type ID` are separate dimensions and must never be combined into one enum. `Kind` describes the work item's structural role and hierarchy (`Epic`, `Story`, `Task`, or `Subtask`). `Task Type ID` describes the activity category (`Algo`, `Data`, `Requirements`, `Bug`, or another configured category). Every task-like record may have both values: for example, a `Task` can be `Algo`, and a `Subtask` can be `Bug`. Projects and epics use `Kind` for hierarchy and do not require a task activity type. Board cards, list rows, Gantt rows, filters, badges, migration reports, and dashboard aggregations must preserve and display these dimensions independently.

| Requirement fields | Current source | Migration / implementation |
|---|---|---|
| ID, Title, Description | `id`, `summary`, `description` | Preserve IDs and values; expose Summary as Title via a schema mapping. |
| Task type | `type` currently means Epic/Story/Task/Bug | Add separate `kind` and `taskTypeId`. Move Epic records to `Projects and Epics`. Preserve Story as a task kind. Map legacy Bug to the Bug category; retain an explicit legacy/default category for other tasks until recategorized. Do not guess Algo/Data/Requirements from titles. |
| Status | Backlog/To Do/In Progress/Review/Done | Map To Do → Ready. Add Blocked and transitions. Preserve legacy Done as migrated completion without inventing an accepting reviewer. |
| Priority | Highest/High/Medium/Low/Lowest | Proposed mapping: Highest → Urgent; High/Medium/Low retained; Lowest → Low. Keep original priority in migration evidence and show the mapping in the dry run. |
| Assignee | Free text `assignee` | Map to stable Team IDs, preserve the old label, and report ambiguous matches. Blank remains unassigned. Do not auto-register ordinary names as agents. |
| Project, Epic, Parent task | One overloaded `parentId`, no project | Create a default project for existing work. Preserve each epic ID. Derive `epicId` through legacy ancestry; retain Story → Task links as `parentTaskId`. Validate project/epic membership and cycles. |
| Dependencies | Comma-separated IDs | Preserve IDs across both entity tables. Define allowed endpoint kinds and validate the complete graph; flag any legacy epic dependencies instead of dropping them. |
| Start/due, Estimate, Progress | Date fields, hours, numeric progress | Preserve typed dates and hours. Add calendar/working-day scheduling mode, milestone flag and explicit scheduling override metadata. Hours remain the effort/capacity unit. |
| Tags | `labels` | Rename in the presentation/schema mapping; preserve comma-separated values. |
| Acceptance criteria | Missing | Add plain-text criteria. |
| Repository, Branch, PR | Missing | Add explicit references/URLs; validate links and render safe links without executing content. |
| Agent instructions, Verification commands | Missing | Add text fields. Commands are task data; reading them does not authorize execution. |
| Result / Evidence | Missing | Add result summary, verification results, artifact/commit/PR links, and known limitations; validate their presence on agent submission. |
| Blocker reason | Missing | Add reason and an explicit unblock destination; require reason for Blocked. |
| Created/updated at and by | Timestamps, `reporter` free text | Preserve timestamps. Add authenticated actor IDs; keep reporter as a separate legacy/user field. Use a migration/unknown marker for historical authors rather than fabricating attribution. |
| Claimed by/at, Last agent activity | Missing | Add server-controlled claim owner, claim time, activity time and claim token/version. Add configurable stale thresholds and explicit release/reassignment. |
| Revision | Derived `version` hash, not a sheet column | Add persisted revisions for task/entity and ordering scope; retain a content fingerprint to detect raw Sheet changes that bypass revision updates. |
| Sort order | Numeric `rank` | Seed manual order from rank with a stable ID tie-breaker. Add epic ordering and scoped ordering records; do not derive relationships or identity from row positions. |
| Existing extra fields | `sprint`, `timeSpent`, `completedDate`, `reporter` | Preserve these during migration even though some are not listed in the new minimum schema. |
| Archive and acceptance metadata | Missing | Add archive timestamp/actor and accepted timestamp/actor. Archive keeps IDs and historical links resolvable. |

### 4.3 Migration procedure

1. Implement a read-only inventory/dry-run command: schema version, counts by kind, duplicate/missing IDs, invalid links/dates/enums, mapping proposals, and unmapped assignees/categories.
2. Back up the full workbook, relevant script properties, deployed version, and current issue export. Record backup IDs without storing credentials.
3. Rehearse migration on an isolated copy. Write the six tabs and system metadata in batches, preserving IDs, dates, descriptions, relationships, legacy extras, and order.
4. Verify source/target record counts, each ID, graph links, field values, typed dates, and repeat-run behavior. Resolve ambiguous mappings explicitly before production cutover.
5. Use a short maintenance window for production cutover so app/API/native edits cannot race the transformation. Use a versioned migration ledger and advance the active schema only after verification succeeds.
6. Keep `Issues` as a protected legacy snapshot through the rollback window; route new reads/writes solely to the new schema. Avoid two writable sources of truth.
7. Rollback restores the matching code, schema/configuration and workbook snapshot. If new-schema writes have occurred, reconcile them before restoring; a code-only downgrade is not sufficient.

## 5. Design decisions and platform constraints

These are proposed implementation defaults. Resolve the listed deployment-dependent decisions in WP-00; the review itself does not change product requirements or access settings.

### A. Shared business operations

All HTML, sidebar and agent writes call the same authenticated service operations. Direct Sheet edits use the same domain validator through reconciliation. Keep reusable pure rules in `Core.js` or modules generated into both runtimes. Server-only authorization, claims and actor assignment must not depend on client checks.

A command carries an operation ID, operation name, entity IDs, expected revisions and changed fields. Resolve the actor from verified credentials. Return structured success data or a stable error code with field/conflict details. Read/authorize/check revisions/validate/write/history/receipt must be one coordinated service path.

Use a script lock to serialize cooperating writers and a Sheets API batch update for related cell/history/receipt changes when feasible. Google documents that a failed request rejects the batch; this is not a compare-and-swap transaction against arbitrary manual edits. Retain fingerprint checks, protected controlled fields, and reconciliation. See [Sheets batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate).

### B. Native Sheet editing and identity

Treat users with direct edit access as trusted Sheet collaborators; app roles cannot remove privileges they already have in the underlying spreadsheet. Protect IDs, revisions, role mappings, claim/acceptance fields, history and operational metadata. Ordinary task fields remain usable in Sheets. Route privileged workflow actions through the app/sidebar.

Maintain bounded last-accepted snapshots keyed by stable ID for validation/history of multi-cell edits. On invalid edits, retain the entered value with a clear diagnostic and offer correction or restoration without overwriting a newer edit. Keep unaffected tasks usable; exclude invalid records from agent eligibility. Reconcile pasted, inserted, sorted, deleted and externally changed rows; batch reads/writes and provide an explicit repair command.

Google edit events supply prior values only for single-cell edits, and user identity is not always available. Do not rely on `e.oldValue` for multirow undo or attribute edits to the trigger owner. Record unknown attribution explicitly; require verified identity for privileged transitions. If attribution of every raw Sheet edit is mandatory, agree on a deployment where it is available or route those edits through the sidebar. See [event objects](https://developers.google.com/apps-script/guides/triggers/events) and [Session identity](https://developers.google.com/apps-script/reference/base/session).

### C. Manual ordering semantics

Define a shared ordering service before implementing more drag handlers:

- Persist an explicit ordering scope: project + grouping + group + optional status column or parent. Matching scopes in different views share the same order. Different groupings have their own projections; document this rather than pretending every flat/hierarchical layout has one identical row order.
- Keep canonical sibling order on Tasks and epic order on Projects and Epics. Store additional flat-board ordering scopes in Settings/system records when they cannot be represented by the canonical hierarchy order.
- A reorder request identifies the moved item/block and before/after neighbor IDs plus expected scope revision. The server resolves positions against the full scope, including filtered-out records.
- Preserve the relative order of every unmoved/hidden item. An epic/group move changes its order while retaining the child sequence and membership. A task's vertical reorder does not change its dates, status or parent.
- Handle status/epic reassignment as a distinct move command that can atomically include destination order. If a parent task moves to another epic, move its descendants consistently or reject the operation with a clear explanation.
- Normalize ranks under the lock when gaps collapse or duplicates are detected. Use scope revisions to detect competing moves, not just the moved task's revision.
- In a non-manual sort, offer an explicit switch to Manual order before dragging. Provide Move up/down, insertion markers, touch targets, and a revision-safe undo action.

WP-05 acceptance must pin down examples for flat Kanban, grouped Kanban, hierarchical table and Gantt. This prevents independent view implementations from silently disagreeing about order.

### D. Agent authentication

Start with a time-boxed proof of an Apps Script API executable called using scoped user OAuth, mapped to an explicitly registered agent principal. Verify identity and permissions for the actual deployment before selecting this as the production transport. A caller-supplied `agentId` is not authentication; shared OAuth identities need an additional verified agent binding or separate authorized identities.

The Execution API requires its own executable deployment and a shared standard Cloud project, and it does not support service accounts. These constraints must be tested before promising unattended service-account integration. If the required runner cannot satisfy them, select an authenticated gateway with a documented identity/secret model before WP-10 proceeds. Do not silently broaden the owner-only web app or add an unauthenticated write endpoint. See [Apps Script API execution](https://developers.google.com/apps-script/api/how-tos/execute).

### E. Scheduling and capacity

Keep effort in hours and date-only values in the configured project/workbook timezone. Existing tasks retain calendar-day scheduling by default. Add an explicit per-project default and task override for working-day mode. Define inclusive date ranges, milestone duration, holiday precedence, partial-day capacity, and how unscheduled work contributes to workload before implementing propagation.

Proposed availability rule: workweek capacity supplies the baseline; holidays/leave reduce it without double-counting overlapping absences; an explicit approved availability override supplies the final capacity. An all-day absence wins over overlapping partial leave. Scheduling overrides are stored and shown, never silently discarded.

## 6. Implementation work packages

Each package should be a reviewable change or small series of changes with its own tests. Proposed filenames describe responsibilities, not a mandatory framework rewrite. Update `scripts/build.mjs` and `.claspignore` whenever modules/templates are added; `CoreScript.html` and `dist/index.html` remain generated outputs.

### WP-00 — Isolated environments and deployment proof

**Dependencies:** none. **Requirements:** 2, 14, 18, 19.

- [ ] Add explicit development/test/production configuration, using separate Apps Script projects and spreadsheet IDs so development triggers cannot write production data.
- [ ] Add a startup health check for schema, required tabs, access, and installed triggers; document setup/repair and deployment rollback.
- [ ] Commit repeatable browser test infrastructure and fixtures without depending on production data or credentials.
- [ ] Prove actor identity and the proposed authenticated agent transport using the actual account/deployment model in section 5D. Document role versus direct-Sheet access boundaries.
- [ ] Add deployment commands that report the target script, spreadsheet environment, source commit and release version; keep owner-only access until a shared-access design is verified.

**Acceptance:** a test edit and trigger execution touch only the test workbook; an unauthorized API call is rejected; the chosen identity strategy demonstrably distinguishes required actors; setup and rollback runbooks name exact targets.

### WP-01 — Versioned schema and safe migration

**Dependencies:** WP-00. **Requirements:** 2, 3, 13.1, 15.

- [ ] Introduce a schema/repository layer (`Schema.js`, `Repository.js`, `Migrations.js`) and the tables/fields in section 4.
- [ ] Use header-to-field mappings, stable IDs and explicit schema versions rather than hardcoded positional assumptions scattered through the server.
- [ ] Add project/epic/task membership rules, arbitrary task-subtask links with cycle prevention, and enum mappings.
- [ ] Preserve legacy values and IDs; support a dry run, repeatable migration, validation report and data-aware rollback.
- [ ] Separate active versus archived records without breaking history or references.

**Acceptance:** migrate a realistic copy with nested stories, dependencies, unscheduled issues and legacy fields; every source ID/value has a documented destination; a second migration adds no duplicates; invalid mappings stop cutover; existing CRUD works through the new repository.

### WP-02 — Authorized mutations, history and native-edit reconciliation

**Dependencies:** WP-00, WP-01. **Requirements:** 13.1, 15, 17, 18; foundations for 4 and 14.

- [ ] Add `Authorization.js`, `TaskService.js`, `History.js`, and `SheetEdits.js` responsibilities. Resolve actor identity server-side and apply project/role/capability checks to every public entry point, including setup/configuration/sample-data operations.
- [ ] Define administrator, editor, viewer and agent permissions plus a reviewer/accept capability. Enforce allowed status transitions, required blocker reasons and explicit unblock destinations.
- [ ] Add operation IDs, persistent idempotency receipts, row/scope revisions, content fingerprints and structured errors. Bound payload/batch sizes and idempotency retention.
- [ ] Persist related writes, history and receipts together where supported; handle ambiguous timeouts by looking up the operation result before retrying.
- [ ] Record actors and changed fields for CRUD, moves, claims, releases, review and archive. Provide paginated history retrieval and a detail-panel history view.
- [ ] Implement the native-edit policy in section 5B, controlled-field protections, row diagnostics, structural-change reconciliation, bulk-paste defaults, and batched trigger writes.
- [ ] Replace ordinary destructive deletion with archive/restore; restrict permanent deletion and define its history/reference policy.

**Acceptance:** a viewer cannot mutate through any callable function; an editor cannot grant roles or accept without reviewer capability; duplicate create requests yield one task; stale writes leave newer work intact; invalid sheet pastes are diagnosed without blocking valid tasks; multirow changes produce truthful history; concurrent native edits are reconciled without silently overwriting newer values.

### WP-03 — Fast entry, autosave, drafts and undo

Inline Kanban quick creation is a required part of this package: each status column provides a minimal title-and-kind control for creating a `Task`, `Story`, or `Epic`. It creates the selected kind in that column's status with configured defaults, supports Enter-to-submit and consecutive entry, and opens the full detail editor only when additional fields are needed.

**Dependencies:** WP-01, WP-02. **Requirements:** 2, 4, 16, 17.

- [ ] Add a persistent quick-add title input with Enter submission and configured defaults; reuse it in Kanban columns and a real Sheets sidebar (`QuickAdd.html` and a menu action).
- [ ] Add multiline paste-to-create with validation preview, batch service calls and idempotency per submitted batch/item.
- [ ] Replace the global save lock in the client with per-record queues and optimistic draft state. Debounce text, save dates/selects immediately, and merge acknowledged changes without rebuilding the active editor.
- [ ] Autosave detail edits with clear pending/saved/failed states. Preserve draft text across failures, refreshes and conflicts, and offer Retry / compare with latest / discard intentionally.
- [ ] Add fast duplication, resetting generated IDs, timestamps, claims, completion and result evidence; let the user choose whether to include subtasks.
- [ ] Implement a command-based undo stack for supported field edits, reorders, status/epic moves, archive/restore and scheduling changes. Undo uses revisions and records a new history event; it never rewrites another user's later changes silently.
- [ ] Preserve focus and keyboard navigation during saves; use confirmation only when discarding unsaved input or performing irreversible actions.

**Acceptance:** title + Enter creates a task from the app, column or sidebar; the next title can be entered while saving; a forced failed inline/detail save retains the exact input; retry creates no duplicate; undo restores values when revisions match and reports a conflict otherwise.

### WP-04 — Settings and configurable task types

**Dependencies:** WP-01, WP-02. **Requirements:** 3, 10, 11 foundation.

- [ ] Add an authorized Settings view and typed settings repository. Configure defaults, workflow labels/policies, hours units, WIP limits and project defaults.
- [ ] Seed task categories Algo, Data, Requirements and Bug with stable IDs; preserve legacy/general mappings from migration.
- [ ] Implement type name, color, badge letter/abbreviation/icon, order, active flag and default selection. Rename without changing references; deactivate without erasing historical labels; require reassignment before deleting a referenced type.
- [ ] Introduce one shared badge renderer for list, board, Gantt and dashboard. Include meaningful text/icon, accessible full label on hover/focus, and tested color contrast.
- [ ] Cache reference data with versioned invalidation after configuration changes. Use configured defaults in every task-creation path.

**Acceptance:** renaming/recoloring a type updates every view without changing task associations; inactive types remain readable but unavailable for new assignment; unauthorized Settings changes fail server-side; title-only creation uses the configured default category and assignee.

### WP-05 — Vertical ordering across all views

**Dependencies:** WP-01, WP-02; undo uses WP-03. **Requirements:** 4.1, 5, 6.1, 7, 15.

- [ ] Implement and test the ordering contract in section 5C in a reusable `Ordering.js` service plus a client interaction controller.
- [ ] Add server commands for task reorder, epic/group reorder and explicit cross-group moves. Include scope revisions and normalize ranks safely.
- [ ] Add drag handles and Move up/down commands to table rows, Kanban cards, epic groups/sidebar and Gantt row labels. Keep Gantt horizontal scheduling and vertical ordering as separate gestures.
- [ ] Add insertion feedback, keyboard focus restoration, touch support, filtered-list neighbor resolution and an explicit Manual order selector.
- [ ] Reuse saved orders across views with matching grouping scopes and preserve children when an epic/group moves. Wire ordering undo to the mutation/history service.

**Acceptance:** move a middle item to first/last, reorder an epic with children, and verify persistence after reload in matching table/board/Gantt groupings. Repeat under filters and non-manual sorting. Two concurrent moves produce a valid serial order or a visible conflict. Reordering changes no status, membership or dates. Repeated insertions never create indistinguishable ranks.

### WP-06 — Task list, hierarchy, filters and saved views

**Dependencies:** WP-01–WP-05. **Requirements:** 4, 5, 6.2.

- [ ] Add selectable/reorderable visible columns and persist per-user preferences.
- [ ] Render expandable parent/subtask trees and project/epic/assignee grouping using stable relationships and ordering services.
- [ ] Add project, priority, tags, date ranges and multi-type filters; keep existing search/status/assignee/epic behavior. Show removable active-filter chips and a complete reset.
- [ ] Persist named views with filters, grouping, sort, columns and collapse state; define personal/shared ownership and permissions. Preserve applicable state between routes and reloads.
- [ ] Add row selection and bulk status, assignee, priority, epic, category and date changes. Preview the affected count and define all-or-nothing behavior for each bounded batch.
- [ ] Highlight blocked, overdue and unassigned tasks; render safe repository/branch/PR links and detail access.

**Acceptance:** save/reopen a filtered grouped view; combine multiple categories with date/priority filters; expand subtasks without disturbing order; bulk-edit selected tasks while hidden tasks remain untouched; rejected bulk operations identify failing records and do not leave an undocumented partial state.

### WP-07 — Complete Kanban and epic swimlanes

**Dependencies:** WP-03–WP-06. **Requirements:** 6, 6.1, 6.2.

- [ ] Add No grouping / Epic / Assignee / Project selectors with aligned status columns, collapsible groups and an explicit No epic lane.
- [ ] Support vertical group order and shared task ordering. Use inline quick-add with the lane/column's defaults.
- [ ] Use one move command for status + epic + destination order. Validate parent/descendant membership before moving across epics.
- [ ] Show incomplete dependencies, blocker reason, epic counts and completion, configured category/attribute badges, and WIP counts/limits. Define warn-versus-block behavior for each WIP setting.
- [ ] Support keyboard status/lane moves and vertical Move up/down with the same server rules as drag-and-drop.

**Acceptance:** a cross-column/cross-epic drag is one audited, undoable operation; an invalid hierarchy move is rejected coherently; collapsed lanes retain state; WIP limits and dependency/blocker indicators reflect current data; the board remains usable without a mouse.

### WP-08 — Team, work calendars and manual availability

**Dependencies:** WP-01, WP-02, WP-04. **Requirements:** 8, 9; Phase 1 foundation for scheduling.

- [ ] Add Team management for human/agent kinds, identities, active status, roles, workweek and daily capacity in hours. Protect role/identity columns and support project default assignees.
- [ ] Add team holidays, individual leave and availability override entry, supporting dates/ranges and partial-day values. Validate overlap handling using section 5E.
- [ ] Add a reusable calendar service that returns daily capacity/working dates for a member/project; configure weekends rather than hardcoding them.
- [ ] Store agent concurrency limits and stale-claim thresholds for WP-10. Deactivation prevents new assignments/claims while retaining historical identity.

**Acceptance:** holidays and personal leave change the correct person's daily capacity; partial-day values and overlapping records have deterministic results; inactive members remain in old history; defaults and units match estimates; role changes require administrator permission.

### WP-09 — Dedicated dashboard and drill-down

**Dependencies:** WP-04, WP-06, WP-08; agent panels need WP-10 and overload panels need WP-12. **Requirements:** 12.

- [ ] Add a dashboard route with summaries by status, epic, category and assignee, plus blocked, overdue, upcoming and review lists.
- [ ] Add epic completion, team workload/availability warnings and agent activity/stale claims as their services become available. Keep incomplete panels visibly unavailable until implemented.
- [ ] Apply project/epic/assignee/category filters and the common badge renderer. Clicking a summary opens the corresponding filtered task view.
- [ ] Define aggregation semantics: count Tasks separately from epic/project containers; compute epic completion from its task descendants with documented archived-task handling; avoid double-counting parent and child effort in capacity totals.

**Acceptance:** each summary reconciles with its drill-down, zero/missing values are handled intentionally, shared filters produce consistent totals, and epic/project containers do not inflate task workload.

### WP-10 — Authenticated agent workflow and API

**Dependencies:** WP-00 identity proof, WP-01, WP-02, WP-04, WP-08. **Requirements:** 13, 13.1, 14.

- [ ] Publish a versioned JSON contract and an authenticated transport adapter (`AgentApi.js`) that invokes the same services as human operations. Include pagination, filters, stable error codes, batch semantics, operation IDs and revisions.
- [ ] Implement `list_tasks`, `get_task`, `create_task`, `update_task`, `claim_task`, `release_task`, `report_progress`, `report_blocker`, and `submit_result`.
- [ ] Return sufficient objective/scope/criteria/dependencies/repository/verification context; treat all task instructions and command text as untrusted data and keep execution permissions in the consuming agent system.
- [ ] Claim under a lock with revision/ownership checks. Enforce agent concurrency limits, active status and unfinished-dependency rules. Permit an explicitly authorized, audited dependency override with a reason.
- [ ] Record server claim/activity timestamps; show stale claims and support explicit release/reassignment. Do not automatically steal a claim just because its timestamp is old.
- [ ] Require a reason for blocking and an explicit destination for unblocking. Permit subtask creation through the same relationship validator.
- [ ] Require result summary, verification results, relevant links and limitations before agent submission to Review. Review may return to In Progress; only an authorized reviewer accepts into Done. Agents cannot bypass this by patching status/progress directly.
- [ ] Store credentials outside workbook/source/client HTML; document provisioning, rotation, revocation, actor binding and safe logging. Add a runnable client example and troubleshooting for authorization/deployment failures.

**Acceptance:** two agents racing for one task yield one owner; retries do not double-create/claim/submit; revoked or spoofed identities fail; concurrency/dependency limits hold; stale release is explicit; evidence-free submission is rejected; an agent cannot accept its own result without reviewer permission; authorized acceptance is audited.

### WP-11 — Gantt completeness and scheduling interactions

**Dependencies:** WP-05, WP-06, WP-08; undo from WP-03. **Requirements:** 7, 4.1.

- [ ] Add month zoom, grouped/collapsible epic/project/assignee rows, vertical row/group ordering, and synchronized filter/manual-order behavior.
- [ ] Add milestones and a separate unscheduled tray with drag-to-schedule using a documented default duration. Keep precise dates editable and keyboard accessible.
- [ ] Render configured weekends, holidays, leave, overdue state, today, progress and visible dependencies. Show useful indicators for dependencies outside the current window/filter.
- [ ] Add dependency/date/availability warnings and explicit override fields. Calendar-day moves preserve calendar duration; working-day moves use the calendar service and preserve the selected working duration.
- [ ] Record horizontal moves/resizes as undoable scheduling commands, distinct from vertical order changes.

**Acceptance:** day/week/month navigation, one-day tasks, milestones, unscheduled drops, date-boundary/DST cases, filtered/grouped vertical moves and holiday overlays work. Dragging horizontally changes dates only; dragging a row handle vertically changes order only. Overrides survive refresh and subsequent calculations.

### WP-12 — Workload, capacity and optional dependency rescheduling

**Dependencies:** WP-08, WP-10, WP-11. **Requirements:** 7, 8, 9, 12; Phase 2.

- [ ] Implement workload allocation and overload views using hours, remaining effort, active work, scheduling spans and daily capacity. Document parent/subtask aggregation and how unestimated/unscheduled tasks are reported without treating them as zero effort.
- [ ] Account for workweeks, holidays, partial leave and overrides; present person-level and project summaries with drill-down.
- [ ] Implement dependency timing analysis with a documented initial dependency relation, proposed finish-to-start. Display violations before introducing automatic date changes.
- [ ] Add optional successor rescheduling, off by default, using a topological plan. Preview the complete affected set, honor explicit/pinned dates, flag unsatisfiable constraints, and apply the accepted plan as one coordinated batch with revision checks and undo.
- [ ] Feed capacity/conflict summaries into dashboard and Gantt, and enforce configured agent claim limits independently of estimated human-style workload.

**Acceptance:** calculated daily load reconciles to the selected effort model; overlapping absence does not double-subtract; zero capacity/missing estimates remain visible; a dependency chain schedules correctly around holidays; pinned dates and cycles produce actionable conflicts; a partial failure cannot leave half an accepted schedule silently applied.

### WP-13 — Extended attributes, templates and historical reporting

**Dependencies:** WP-02, WP-04, WP-06, WP-09; scheduling metrics use WP-12. **Requirements:** 4, 11, 17, Phase 3 of 20.

- [ ] Add text/number/date/checkbox/single-select custom attribute definitions and stable option IDs, validation, lifecycle rules, and a documented plain-column storage strategy. Preserve historical values during rename/deactivation.
- [ ] Let Settings choose task type or a custom attribute as the primary badge source; support colored values, initials, abbreviations/icons and accessible labels consistently across every view.
- [ ] Add reusable personal/shared task templates, safe duplication options and advanced bulk application. Reset generated workflow metadata on creation; validate template references against active settings.
- [ ] Extend saved views and dashboard configuration with permissions and stable configuration revisions.
- [ ] Build initial historical reports from Change History: throughput, lead/cycle time with documented status definitions, blocked duration, agent claim/review activity, and relevant filters/exports. Do not infer historical actors or transitions that were never recorded.

**Acceptance:** each attribute type round-trips through Sheet/app/API with correct validation; option renames preserve assignment; badge meaning does not depend only on color; templates create valid fresh tasks; reports reconcile to known synthetic history and explicitly exclude unavailable legacy history.

### WP-14 — Performance, resilience and release verification

**Dependencies:** starts with WP-00 and accompanies every package; final gate after all required packages. **Requirements:** 16, 17, 19.

- [ ] Build a reproducible 2,000-task dataset with projects, epics, subtasks, dependencies, long descriptions, team calendars and history. Separate summary payloads from lazily fetched detail/history; add pagination/delta reconciliation where justified.
- [ ] Batch reads/writes and update only changed fields. Cache reference data by configuration version. Keep locks short without weakening revision/claim guarantees. Virtualize long tables/boards/Gantt rows and redraw only affected content.
- [ ] Measure client feedback, initial usable view and server save completion separately under documented browser, network, account, payload and concurrency conditions. Proposed acceptance: feedback ≤100 ms, usable view ≤3 s, ordinary save ≤2 s; report cold/warm distributions and chosen percentile rather than relying on a single best run.
- [ ] Add automated browser workflows, service integration tests and real Apps Script smoke tests in the test environment. Cover permissions, claims, filtered ordering, history, migration, working calendars, retries, keyboard/touch and server failures.
- [ ] Add CI for domain/service tests, browser checks, build/template integrity and deployment allowlists. Secrets remain in the approved credential store.
- [ ] Implement versioned backups with retention, full-project restore and a periodic restore drill; include settings/history/relationships/operational state, not only current filtered task CSV.
- [ ] Document supported undo operations and conflict limits, error codes, recovery, native-edit restrictions, API authentication, and release rollback. Record release evidence with source commit, Apps Script version and migration version.

**Acceptance:** all required workflows pass against the release candidate; migration/restore drills preserve IDs and links; performance targets are met under agreed conditions or explicitly renegotiated with measured evidence before claiming completion; the production release uses the tested source/schema and preserves the intended audience.

## 7. Delivery sequence and release gates

| Stage | Work packages | Gate to proceed |
|---|---|---|
| Foundation | WP-00 → WP-01 → WP-02 | Isolated environment; reviewed migration; verified identity/permissions; recoverable writes and direct-edit handling. |
| Phase 1: human workflows | WP-03 and WP-04 → WP-05 → WP-06 → WP-07; WP-08 after settings | Fast entry/editing, configured types, consistent ordering, filtered hierarchical list, grouped Kanban, team/calendar entry. |
| Phase 1: agent MVP | WP-10 after identity/service/team foundations; WP-09 dashboard integrates available services | Authenticated agent listing/claims/progress/results, review acceptance, history and dashboard. Phase 1 is not complete without this gate. |
| Phase 2: scheduling/planning | WP-11 → WP-12; complete dashboard capacity panels | Gantt completeness, working calendars, capacity, dependency warnings and optional rescheduling. |
| Phase 3: customization/reporting | WP-13 | Attributes, badge selection, advanced templates/views and historical reporting. |
| Every release / final acceptance | WP-14 throughout | Tests, native-runtime verification, performance evidence, recoverability and traceable deployment. |

The first implementation change should be WP-00 plus the WP-01 migration dry run. The first visible improvement should be WP-03 quick entry and reliable draft saving. Vertical reordering is a Phase 1 deliverable and should follow immediately once the shared schema and mutation service are ready.

## 8. Final completion checklist

- [ ] Every row in the requirements coverage table is satisfied by implementation and linked verification evidence; optional features are available through configuration.
- [ ] Existing project data survives migration with stable IDs, relationships, dates and preserved legacy fields.
- [ ] All supported views and the Sheets sidebar use the same rules, defaults, permissions and mutation service.
- [ ] Tasks, epics and groups reorder vertically with consistent scope semantics, persistence, keyboard access and undo.
- [ ] Agent claims, workflow transitions, evidence submission and acceptance are authenticated, revision-safe, idempotent and audited.
- [ ] Native Sheet edits, invalid rows, concurrent changes, transient failures and restores have tested behavior and clear recovery paths.
- [ ] Team capacity, calendars, Gantt behavior, optional rescheduling, customization and reporting meet their documented definitions.
- [ ] The 2,000-task targets and live Apps Script checks have recorded results; passing local mocks alone is not a release sign-off.
