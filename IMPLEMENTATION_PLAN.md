# Implementation review and completion plan

Reviewed: 2026-10-28. Source baseline: current `implement_plan` branch (pushed baseline `f9ec8e0` plus the Sheet column changes in this update). Compared with [ProductRequiremtns.md](ProductRequiremtns.md), including section 4.1 on vertical reordering. The previous review was based on `420b8e5`; its coverage table and findings below have been reconciled with the current source.

## 1. Review outcome

The current application is a useful personal tracker with a Google Sheets issue register, editable table, Kanban, Gantt, issue details, basic filters, CSV export, and version checks for app writes. This implementation adds an explicit v2 repository cutover, repeatable migration validation, v2 CRUD/archive/restore, rollback synchronization, role checks on server entry points, parent-cycle validation, and direct-edit diagnostics. It does not yet implement the full team and agent task manager described in the requirements.

Since the previous review, the branch completed substantial Gantt and swimlane work: Epic durations derive from child schedules; Epic lanes collapse across views; Gantt rows show the parent hierarchy, support Story-child collapse, quick-add, comments, type badges, label resizing, and vertical reorder/reparent/unparent interactions. The neutral/cobalt palette is also present. These features are reflected in the current requirements, but the implementation-package checklists had not been updated.

**Current branch verification:** `npm run build` succeeds and `npm test` passes **53 tests**. New in-memory Apps Script mocks cover repeat migration, v2 cutover/rollback, repository CRUD, archive/restore, role enforcement, direct Sheet validation, v2 ordering/moves, quick-add defaults, and idempotent batch creation. The local browser demo has smoke checks for multi-type filters, removable chips, priority/tag/date bounds and reset; parent-first Sheet rows, per-parent collapse persistence, Sheet row moves with focus restoration, and column select/reorder persistence; saved-view save/load/reopen across reload with filters, columns and collapse state; Gantt and Kanban keyboard moves; detail autosave/conflict recovery/undo; quick-add queuing; and pasted batch preview/create. There is no committed automated browser suite. No live Apps Script migration/role acceptance, concurrency load test, or 2,000-task benchmark has been recorded. `clasp push` uploads source, but a new versioned web-app deployment has not been verified as part of this review.

The plan is still broader than the current product. A partial foundation does not count as a completed package: `[x]` means the whole listed item is implemented and checked; `[~]` means some of it exists but its stated scope or evidence is incomplete; `[ ]` means it remains open. The acceptance criteria for a package remain open until their end-to-end conditions are met.

### Status definitions

- **Implemented:** the named capability exists in the inspected code; this does not imply every requirement in its section is complete.
- **Partial:** a useful subset exists, but behavior, coverage, or verification is missing.
- **Missing:** no implementation was found in the current source.
- In work-package lists, `[x]` means complete, `[~]` means partial, and `[ ]` means open. Parenthetical notes name what remains.
- The WP-00–WP-14 task lists currently contain **13 complete, 49 partial, and 31 open items**. All final release-gate checks in section 8 remain open.

## 2. Findings to address first

| Priority | Current finding and evidence | Consequence | Planned resolution |
|---|---|---|---|
| P0 | The schema migration now supports explicit activation, repository-backed CRUD, archive/restore, repeat-safe copy, and rollback synchronization. Activation has only been exercised against local mocks. | Existing deployments continue on `Issues` until an operator validates and activates v2 in a separate test workbook. | WP-00/WP-01: run migration, direct-edit, activation, and rollback smoke checks against an isolated Apps Script workbook before production cutover. |
| P0 | [Authorization.js](Authorization.js) now gates setup, migration, environment and data operations; enforced mode rejects missing identities and treats unmapped users as viewers. Enforcement remains off by default, and actual deployment identity/direct-Sheet sharing are unverified. | Role checks are not yet evidence of a team or agent security boundary. | WP-00/WP-02/WP-10: verify identity in the intended deployment and explicitly test enforcement before sharing. |
| P0 | `handleSheetEdit()` now validates legacy and active-v2 edits, retains invalid input with row notes, and batches changed-range writes. Settings/calendar validation and structural-change recovery still need work; direct-edit history is incomplete. | Direct edits have better diagnostics, but concurrent row changes and configuration edits still need reconciliation rules. | WP-02: finish native-edit snapshots, protected columns, truthful history, and live multirow/concurrency tests. |
| P1 | A server `moveIssue()` command checks the issue revision and records moves; Kanban and Gantt use it for status/parent/rank drags. The broader ordering service still handles one status scope, and Sheet rows have no move controls. | Ordering scopes and revisions are not shared across all views; concurrent reorders and filtered/sorted insertion rules are not covered. | WP-05: complete one shared ordering contract and add Sheet, keyboard, group-move, undo, and conflict behavior. |
| P1 | The client now serializes saves per record, autosaves detail edits, preserves drafts/operation IDs, and avoids applying stale acknowledgements over newer editor text. Revision conflicts offer retry, compare-with-latest, and discard controls. | Conflict comparison and undo coverage are basic; autosave/queue races have only local smoke checks. Undo for create/archive/comment/batch is missing. | WP-03: add automated failure/concurrency coverage, robust merge/discard behavior, duplication, and undo for remaining mutation types. |
| P1 | History and idempotency receipt services exist; client operation IDs cover issue saves, moves, and sidebar creation. Delete/comment IDs, atomic history/receipt writes, and legacy deletion recovery remain open. | Some retries are safe, but ambiguous mutations and native edits do not have a complete recovery trail. | WP-02/WP-03: coordinate mutation/history/receipt writes and implement archive/restore consistently across active schemas and clients. |
| P1 | `getProject()` and `saveIssue()` load the issue register, and rendering rebuilds the active view. No 2,000-task benchmark or concurrency load test is recorded. | Performance targets remain unproven and full-register operations may slow as the project grows. | WP-14: measure representative workloads before optimizing paging, changed-field writes, caching, or virtualization. |

## 3. Requirements coverage

Work-package references point to section 6. Optional features in the requirements remain included in the plan; optional means configurable, not omitted.

| Requirement section | Current coverage | Still open | Work packages |
|---|---|---|---|
| 1. Purpose | Partial: usable human tracker with Sheet, Kanban, and Gantt views. | Agentic workflow, full dashboard, team capacity, and measured fast-entry performance. | WP-03, WP-08–WP-10, WP-12, WP-14 |
| 2. Architecture | Partial: Apps Script/HTML/Sheets, direct Sheet editing, stable IDs, environment configuration, health checks, schema migration, explicit v2 CRUD cutover, and a Quick Add sidebar. | Run cutover in a live test workbook; verify separate development/test/production script and workbook targets. | WP-00, WP-01, WP-03 |
| 3. Task data model | Partial: legacy fields migrate into v2 project/task records with separate Kind and Task Type ID, nested parent links, schema versions, and preserved legacy JSON. App can use v2 after activation. | Complete all task/project lifecycle fields, task-type kind UI, team/agent references, and live migration evidence. | WP-01, WP-02, WP-04, WP-10 |
| 4. Fast creation/editing | Partial: quick-add sidebar, title-only issue creation, validated multiline paste with a per-item idempotent batch, table inline edits, detail editor, optimistic saves, local drafts, retries, per-record queues, detail autosave, basic conflict compare/discard, revision-checked undo for saved issue changes, and shortcuts. | Bulk edits, duplication, create/archive/comment/batch undo, automatic merge, and complete keyboard/focus support. | WP-03, WP-06, WP-13 |
| 4.1. Vertical reordering | Partial: Kanban card moves and Gantt row reorder/reparent/unparent exist; Sheet rows can move within the same status/parent scope with buttons or drag while Manual order is active. Kanban and Gantt keyboard shortcuts also move issues, and ranks persist. | Shared server-side move/order contract, cross-group and Sheet hierarchy moves, undo coverage for every move type, sorted/filtered neighbor rules, group moves with children, and concurrent order-scope checks. | WP-05, WP-07, WP-11 |
| 5. Task list | Partial: editable issue table, search, one-column sort, browser-persisted selectable/reorderable columns, Epic sections, parent-first nested rows with per-parent collapse state, personal saved views, and inline details. | Account-synced column preferences, broader grouping, shared saved views, bulk actions, and blocked/overdue/unassigned styling. | WP-01, WP-06, WP-10 |
| 6. Kanban | Partial: status columns, drag status/reorder, quick-add, Epic swimlanes, and configured task-type badges. | WIP limits, dependency/blocker indicators, keyboard moves, richer quick-create defaults, and shared audited ordering/move behavior. | WP-03–WP-05, WP-07 |
| 6.1. Epic swimlanes | Mostly implemented: Sheet/Kanban/Gantt share the swimlane toggle and Epic/no-Epic grouping; lanes collapse, counts/progress show, and grouped views avoid duplicate Epic rows. Kanban reparents on cross-lane drops; Gantt has derived Epic bars and its own row hierarchy/collapse. | Epic/assignee/project grouping selectors, keyboard lane moves, and shared server-side ordering/moves with audit/undo. | WP-05, WP-07, WP-11 |
| 6.2. Filters | Partial: search, multi-type selection, status, priority, assignee, sprint, tag, start/due date bounds, Epic filters, removable chips, and personal saved views. | Project filters, shared saved views, and server-side ownership/permissions. | WP-04, WP-06 |
| 7. Gantt | Partial but substantially improved: day/week zoom, date move/resize, progress, dependencies, today/weekends, derived Epic dates, hierarchical rows, collapsible Epic/Story children, vertical hierarchy moves, double-click editing, quick-add, task-type badges, comment previews, and resizable labels. | Month zoom, milestones, holiday/leave/overdue overlays, unscheduled tray/drop-to-schedule, project/assignee grouping, conflict warnings, working-day scheduling, optional successor rescheduling, and scheduling undo. | WP-05, WP-08, WP-11, WP-12 |
| 8. Team/capacity | Partial schema only: v2 defines Team fields; assignees in the current app remain text values. | Team UI, verified identities, roles, capacity/workweek, project defaults, active lifecycle, workload and concurrency limits. | WP-01, WP-02, WP-08, WP-10, WP-12 |
| 9. Holidays/availability | Partial schema only: v2 defines an availability tab; Gantt shades weekends. | Holiday/leave entry, partial-day availability, configurable workweeks, and scheduling/workload integration. | WP-08, WP-11, WP-12 |
| 10. Types/settings | Partial: seeded type IDs and default settings; Settings `Value` supports legacy names and JSON name/color/badge values; invalid/missing values fall back safely. | Authorized type-management UI and full rename/deactivate/delete/order/default lifecycle. | WP-04 |
| 11. Attributes/badges | Partial: configured letter/color task-type badges show in Sheet, Kanban, and Gantt. | Custom attributes and colored values, selectable badge source, lifecycle and contrast review, dashboard rendering. | WP-04, WP-13 |
| 12. Dashboard | Partial: top-level summary counters exist. | Dedicated status/Epic/type/assignee dashboard, actionable lists, workload panels, filters, and drill-down. | WP-09, WP-10, WP-12 |
| 13. Agent workflow | Missing beyond role/schema fields. | Ready-task listing, atomic claims, progress/block/release/result operations, dependency guards, evidence, stale-claim handling, and review acceptance. | WP-01, WP-02, WP-08, WP-10 |
| 13.1. Status flow | Partial: current labels include Backlog, To Do, In Progress, Review, Done; v2 maps To Do to Ready. | Blocked status/reason, transition rules, explicit unblock destination, evidence-gated Review, reviewer-controlled acceptance. | WP-01, WP-02, WP-10 |
| 14. Agent interface | Missing: app CRUD uses `google.script.run`; actor/role and history primitives exist, but there is no authenticated agent contract/transport. | Nine named operations, versioned JSON, pagination/batches, operation IDs from clients, stable errors, credential lifecycle, and identity proof. | WP-00, WP-02, WP-10 |
| 15. Integrity/concurrency | Partial: app writes use a script lock and content versions; v2 validates parent membership/cycles and archives linked records; direct edits produce validation notes. | Structural row reconciliation, atomic multi-record moves, protected configuration, and order-scope conflict checks. | WP-01, WP-02, WP-05, WP-10 |
| 16. Performance | Partial: range reads/writes are batched in places, app views reuse loaded data, and app saves queue per record. | Changed-field writes, cache invalidation/virtualization, and documented 100 ms / 3 s / 2 s measurements on 2,000 issues. | WP-02, WP-03, WP-14 |
| 17. Reliability/history | Partial: local drafts/retry, per-record save queues, basic conflict comparison, revision-checked undo for saved issue edits/moves/schedules, CSV, v2 Change History/idempotency primitives, and v2 archive/restore exist. | Operation IDs on every mutation, complete native-edit history, detail history, undo for create/archive/comment/batch, backups, and automated undo conflict coverage. | WP-02, WP-03, WP-10, WP-14 |
| 18. Access control | Partial: capability roles gate known server operations and enforced mode rejects missing identities; enforcement remains disabled by default and Sheets sharing is a separate boundary. | Verify role behavior in the intended deployment, protect direct Sheet/config access, and secure agent credentials. | WP-00, WP-02, WP-10 |
| 19. Development/verification | Partial: separated core/server/client files, build, GitHub Pages workflow, 53 model/mocked Apps Script tests, and manual local browser smoke checks for autosave, batch creation, Gantt keyboard movement, and undo. | Automated browser tests, real Apps Script migration/role smoke tests, concurrency/load coverage, and deployment-version evidence. | WP-00, WP-14 |
| 20. Delivery priorities | Partial: personal tracker foundation and substantial Gantt/Swimlane work; Phase 1 is not complete. | Finish the human workflow, team/calendar, and authenticated agent MVP gates before claiming Phase 1; finish scheduling/capacity for Phase 2. | Release sequence in section 7 |

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

- [~] Add explicit development/test/production configuration, using separate Apps Script projects and spreadsheet IDs so development triggers cannot write production data. (Environment names and spreadsheet properties exist; distinct projects and isolation proof remain open.)
- [~] Add a startup health check for schema, required tabs, access, and installed triggers; document setup/repair and deployment rollback. (Schema/trigger checks and setup docs exist; access checks and rollback proof remain open.)
- [ ] Commit repeatable browser test infrastructure and fixtures without depending on production data or credentials.
- [~] Prove actor identity and the proposed authenticated agent transport using the actual account/deployment model in section 5D. Document role versus direct-Sheet access boundaries. (Actor/role scaffolding exists; identity and agent transport are not verified.)
- [ ] Add deployment commands that report the target script, spreadsheet environment, source commit and release version; keep owner-only access until a shared-access design is verified.

**Acceptance:** a test edit and trigger execution touch only the test workbook; an unauthorized API call is rejected; the chosen identity strategy demonstrably distinguishes required actors; setup and rollback runbooks name exact targets.

### WP-01 — Versioned schema and safe migration

**Dependencies:** WP-00. **Requirements:** 2, 3, 13.1, 15.

- [x] Introduce a schema/repository layer (`Schema.js`, `Repository.js`, `Migrations.js`) and the tables/fields in section 4. (V2 tabs and header-based access are used by app CRUD after the explicit administrator cutover.)
- [~] Use header-to-field mappings, stable IDs and explicit schema versions rather than hardcoded positional assumptions scattered through the server. (Stable IDs and schema versions exist; legacy CRUD still uses fixed columns.)
- [x] Add project/epic/task membership rules, arbitrary task-subtask links with cycle prevention, and enum mappings. (Nested tasks are supported, parent cycles are rejected, and v2 keeps kind separate from task type.)
- [~] Preserve legacy values and IDs; support a dry run, repeatable migration, validation report and data-aware rollback. (Local mocks cover safe repeat, ID checks, rollback copy, and detection of legacy edits after rollback; a real test-workbook drill remains open.)
- [~] Separate active versus archived records without breaking history or references. (V2 deletion archives tasks/epics and exposes restore; legacy mode still physically deletes.)

**Acceptance:** migrate a realistic copy with nested stories, dependencies, unscheduled issues and legacy fields; every source ID/value has a documented destination; a second migration adds no duplicates; invalid mappings stop cutover; existing CRUD works through the new repository.

### WP-02 — Authorized mutations, history and native-edit reconciliation

**Dependencies:** WP-00, WP-01. **Requirements:** 13.1, 15, 17, 18; foundations for 4 and 14.

- [~] Add `Authorization.js`, `TaskService.js`, `History.js`, and `SheetEdits.js` responsibilities. Resolve actor identity server-side and apply project/role/capability checks to every public entry point, including setup/configuration/sample-data operations. (Known mutation/configuration entry points are gated; deployment identity is unverified, policy enforcement is off by default, and permissions still live in the current server files rather than separate services.)
- [~] Define administrator, editor, viewer and agent permissions plus a reviewer/accept capability. Enforce allowed status transitions, required blocker reasons and explicit unblock destinations. (Role names/capabilities exist; transition, blocker, and review policies are not enforced.)
- [~] Add operation IDs, persistent idempotency receipts, row/scope revisions, content fingerprints and structured errors. Bound payload/batch sizes and idempotency retention. (App saves, moves and sidebar creation now supply stable retry IDs; delete/comment IDs, scope revisions, receipt retention, batch limits and structured error coverage remain open.)
- [ ] Persist related writes, history and receipts together where supported; handle ambiguous timeouts by looking up the operation result before retrying.
- [~] Record actors and changed fields for CRUD, moves, claims, releases, review and archive. Provide paginated history retrieval and a detail-panel history view. (CRUD/reorder/archive history and paginated retrieval exist; native-edit field diffs, workflow events and history UI remain open.)
- [~] Implement the native-edit policy in section 5B, controlled-field protections, row diagnostics, structural-change reconciliation, bulk-paste defaults, and batched trigger writes. (Legacy and v2 task edits validate with row notes and batched writes; configuration validation, protected ranges and structural-sort reconciliation remain open.)
- [~] Replace ordinary destructive deletion with archive/restore; restrict permanent deletion and define its history/reference policy. (V2 delete archives and `restoreIssue` is revision-checked; legacy-mode deletion is still physical and restore has no UI.)

**Acceptance:** a viewer cannot mutate through any callable function; an editor cannot grant roles or accept without reviewer capability; duplicate create requests yield one task; stale writes leave newer work intact; invalid sheet pastes are diagnosed without blocking valid tasks; multirow changes produce truthful history; concurrent native edits are reconciled without silently overwriting newer values.

### WP-03 — Fast entry, autosave, drafts and undo

Inline Kanban quick creation is a required part of this package: each status column provides a minimal title-and-kind control for creating a `Task`, `Story`, or `Epic`. It creates the selected kind in that column's status with configured defaults, supports Enter-to-submit and consecutive entry, and opens the full detail editor only when additional fields are needed.

**Dependencies:** WP-01, WP-02. **Requirements:** 2, 4, 16, 17.

- [x] Support inline Kanban creation for Task/Story/Epic in the selected column and parent-aware Gantt quick-add under Epics/Stories. Gantt children start in Backlog with the configured default task type.
- [~] Add a persistent quick-add title input with Enter submission and configured defaults; reuse it in Kanban columns and a real Sheets sidebar (`QuickAdd.html` and a menu action). (Kanban/Gantt quick-add exists; the new Sheets sidebar supports consecutive title/type/Epic-parent entry and configured defaults. Apps Script browser smoke coverage remains open.)
- [x] Add multiline paste-to-create with validation preview, batch service calls and idempotency per submitted batch/item. Up to 100 titles are validated before submit; an interrupted or partially rejected batch keeps stable per-item operation IDs for retry, and server results include per-item errors.
- [~] Replace the global save lock in the client with per-record queues and optimistic draft state. Debounce text, save dates/selects immediately, and merge acknowledged changes without rebuilding the active editor. (Saves now serialize per issue, queue acknowledgements preserve newer editor input, and saves on different issues are not globally blocked; automated concurrent-save and failure coverage remains open.)
- [~] Autosave detail edits with clear pending/saved/failed states. Preserve draft text across failures, refreshes and conflicts, and offer Retry / compare with latest / discard intentionally. (Debounced text and immediate select/date autosave, saved-state status, local retry drafts, and basic revision-conflict compare/discard are implemented; automated failure/conflict coverage and automatic merge remain open.)
- [ ] Add fast duplication, resetting generated IDs, timestamps, claims, completion and result evidence; let the user choose whether to include subtasks.
- [~] Implement a command-based undo stack for supported field edits, reorders, status/epic moves, archive/restore and scheduling changes. Undo uses revisions and records a new history event; it never rewrites another user's later changes silently. (A browser-local stack persists up to 50 acknowledged issue edits, reorders, moves and schedule changes; it checks the current revision and writes a new revision. Create, comment, batch and archive/restore undo plus automated conflict tests remain open.)
- [~] Preserve focus and keyboard navigation during saves; use confirmation only when discarding unsaved input or performing irreversible actions. (Basic shortcuts and Gantt keyboard activation exist; focus-preserving saves and full keyboard workflows do not.)

**Acceptance:** title + Enter creates a task from the app, column or sidebar; the next title can be entered while saving; a forced failed inline/detail save retains the exact input; retry creates no duplicate; undo restores values when revisions match and reports a conflict otherwise.

### WP-04 — Settings and configurable task types

**Dependencies:** WP-01, WP-02. **Requirements:** 3, 10, 11 foundation.

- [x] Seed Algo, Data, Requirements, and Bug defaults; accept legacy names and JSON name/color/badge values; show compact configured badges consistently in Sheet, Kanban, and Gantt.
- [~] Add an authorized Settings view and typed settings repository. Configure defaults, workflow labels/policies, hours units, WIP limits and project defaults. (Typed Settings tab/API exist; no Settings view and most policy settings are not implemented.)
- [~] Seed task categories Algo, Data, Requirements and Bug with stable IDs; preserve legacy/general mappings from migration. (Stable task-type IDs/defaults exist; migration maps legacy issues only partially.)
- [~] Implement type name, color, badge letter/abbreviation/icon, order, active flag and default selection. Rename without changing references; deactivate without erasing historical labels; require reassignment before deleting a referenced type. (Name/color/letter/default values work through Settings; full lifecycle UI and reassignment are open.)
- [~] Introduce one shared badge renderer for list, board, Gantt and dashboard. Include meaningful text/icon, accessible full label on hover/focus, and tested color contrast. (Sheet, Kanban, and Gantt use the task-type badge; dashboard and contrast acceptance are open.)
- [~] Cache reference data with versioned invalidation after configuration changes. Use configured defaults in every task-creation path. (Configured defaults are used by app quick-add; versioned cache invalidation is missing.)

**Acceptance:** renaming/recoloring a type updates every view without changing task associations; inactive types remain readable but unavailable for new assignment; unauthorized Settings changes fail server-side; title-only creation uses the configured default category and assignee.

### WP-05 — Vertical ordering across all views

**Dependencies:** WP-01, WP-02; undo uses WP-03. **Requirements:** 4.1, 5, 6.1, 7, 15.

- [x] Add Gantt label/Epic-header drag reordering and valid Epic/Story parent drops, including an explicit target to unparent non-Epics.
- [~] Implement and test the ordering contract in section 5C in a reusable `Ordering.js` service plus a client interaction controller. (Server rank service and some UI drag paths exist; the shared contract is not wired across views.)
- [~] Add server commands for task reorder, epic/group reorder and explicit cross-group moves. Include scope revisions and normalize ranks safely. (`reorderIssue()` handles one status scope; cross-group commands and scope revisions are open.)
- [~] Add drag handles and Move up/down commands to table rows, Kanban cards, epic groups/sidebar and Gantt row labels. Keep Gantt horizontal scheduling and vertical ordering as separate gestures. (Sheet rows now have Move up/down and drag controls within the same status/parent scope when Manual order is active; Kanban/Gantt moves and their keyboard controls exist. Cross-group moves, epic/sidebar controls, and shared order semantics remain open.)
- [~] Add insertion feedback, keyboard focus restoration, touch support, filtered-list neighbor resolution and an explicit Manual order selector. (Gantt/Kanban insertion feedback exists; the other controls/semantics are open.)
- [~] Reuse saved orders across views with matching grouping scopes and preserve children when an epic/group moves. Wire ordering undo to the mutation/history service. (Rank is reused for basic sorting; consistent scopes, child-group moves, and undo are open.)

**Acceptance:** move a middle item to first/last, reorder an epic with children, and verify persistence after reload in matching table/board/Gantt groupings. Repeat under filters and non-manual sorting. Two concurrent moves produce a valid serial order or a visible conflict. Reordering changes no status, membership or dates. Repeated insertions never create indistinguishable ranks.

### WP-06 — Task list, hierarchy, filters and saved views

**Dependencies:** WP-01–WP-05. **Requirements:** 4, 5, 6.2.

- [~] Add selectable/reorderable visible columns and persist per-user preferences. (Users can select and order Sheet columns with browser-local persistence; account-synced preferences remain open.)
- [~] Render expandable parent/subtask trees and project/epic/assignee grouping using stable relationships and ordering services. (Sheet rows now render parent-first trees and persist each parent’s collapse state; Epic sections also collapse. Project/assignee grouping is missing.)
- [~] Add project, priority, tags, date ranges and multi-type filters; keep existing search/status/assignee/epic behavior. Show removable active-filter chips and a complete reset. (Multi-type, priority, tag, date bounds, and removable chips are implemented with existing search/status/assignee/sprint/Epic filters; project filtering remains open.)
- [~] Persist named views with filters, grouping, sort, columns and collapse state; define personal/shared ownership and permissions. Preserve applicable state between routes and reloads. (Views save in browser storage with filters, view, sort, columns, swimlanes and collapse state; shared ownership and server-side permissions remain open.)
- [ ] Add row selection and bulk status, assignee, priority, epic, category and date changes. Preview the affected count and define all-or-nothing behavior for each bounded batch.
- [~] Highlight blocked, overdue and unassigned tasks; render safe repository/branch/PR links and detail access. (Some overdue/status cues exist; blocked/unassigned highlighting and implementation links do not.)

**Acceptance:** save/reopen a filtered grouped view; combine multiple categories with date/priority filters; expand subtasks without disturbing order; bulk-edit selected tasks while hidden tasks remain untouched; rejected bulk operations identify failing records and do not leave an undocumented partial state.

### WP-07 — Complete Kanban and epic swimlanes

The current Kanban presentation supports Epic swimlanes and a flat-board toggle. Epic swimlane semantics are also used by Sheet and Gantt; dashboard grouping is still open.

The Kanban swimlane presentation is optional: a persisted toolbar toggle can turn swimlanes on or off. When off, the board uses one flat set of status columns while retaining each task's epic relationship so turning swimlanes back on restores the grouping.

**Dependencies:** WP-03–WP-06. **Requirements:** 6, 6.1, 6.2.

- [x] Add a persisted swimlanes on/off toggle shared by Sheet, Kanban, and Gantt. Off renders flat views and preserves task parent relationships; on restores Epic grouping and collapse state.
- [x] Collapse/expand Epic and No epic lanes across Sheet, Kanban, and Gantt; show lane counts/progress and represent each Epic once in grouped views.
- [ ] Add No grouping / Epic / Assignee / Project selectors; Epic grouping currently has aligned status columns, collapsible groups and an explicit No epic lane.
- [~] Support vertical group order and shared task ordering. (Gantt Epic headers can reorder and inline quick-add exists; lane order is not consistently draggable/shared.)
- [~] Replace the current client-side status/parent/rank save with one server-side move command and validate parent/descendant membership before moving across epics. (Kanban and Gantt drag moves now use an audited revision-checked server command; scope revisions, multi-record/group moves, and browser conflict recovery remain open.)
- [x] Show Epic item counts/completion and configured task-type badges in the grouped views.
- [ ] Add Kanban dependency/blocker indicators and configurable WIP counts/limits; define warn-versus-block behavior for each WIP setting.
- [~] Support keyboard status/lane moves and vertical Move up/down with the same server rules as drag-and-drop. (Kanban cards can move up/down within a lane and left/right through statuses; Gantt hierarchy keyboard moves are available. Keyboard lane changes, Sheet moves, and automated focus/conflict tests remain open.)

**Acceptance:** a cross-column/cross-epic drag is one audited, undoable operation; an invalid hierarchy move is rejected coherently; collapsed lanes retain state; WIP limits and dependency/blocker indicators reflect current data; the board remains usable without a mouse.

### WP-08 — Team, work calendars and manual availability

**Dependencies:** WP-01, WP-02, WP-04. **Requirements:** 8, 9; Phase 1 foundation for scheduling.

- [~] Add Team management for human/agent kinds, identities, active status, roles, workweek and daily capacity in hours. Protect role/identity columns and support project default assignees. (V2 Team schema exists; management and enforcement are missing.)
- [~] Add team holidays, individual leave and availability override entry, supporting dates/ranges and partial-day values. Validate overlap handling using section 5E. (V2 availability schema exists; UI and calendar behavior are missing.)
- [ ] Add a reusable calendar service that returns daily capacity/working dates for a member/project; configure weekends rather than hardcoding them.
- [~] Store agent concurrency limits and stale-claim thresholds for WP-10. Deactivation prevents new assignments/claims while retaining historical identity. (V2 fields exist; claim/deactivation behavior is missing.)

**Acceptance:** holidays and personal leave change the correct person's daily capacity; partial-day values and overlapping records have deterministic results; inactive members remain in old history; defaults and units match estimates; role changes require administrator permission.

### WP-09 — Dedicated dashboard and drill-down

**Dependencies:** WP-04, WP-06, WP-08; agent panels need WP-10 and overload panels need WP-12. **Requirements:** 12.

- [~] Add a dashboard route with summaries by status, epic, category and assignee, plus blocked, overdue, upcoming and review lists. (The current page has summary counters only.)
- [ ] Add epic completion, team workload/availability warnings and agent activity/stale claims as their services become available. Keep incomplete panels visibly unavailable until implemented.
- [ ] Apply project/epic/assignee/category filters and the common badge renderer. Clicking a summary opens the corresponding filtered task view.
- [~] Define aggregation semantics: count Tasks separately from epic/project containers; compute epic completion from its task descendants with documented archived-task handling; avoid double-counting parent and child effort in capacity totals. (Epic progress exists in lane headers; dashboard/capacity semantics remain open.)

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

- [x] Derive each Gantt Epic summary range from scheduled descendants and show its read-only summary bar in the lane header.
- [x] Render parent-first Story/Task/Bug rows; allow independent Story-child collapse in flat and swimlane modes; retain the state in browser UI settings.
- [x] Support Gantt double-click editing, resizable label pane, parent-aware quick-add, task-type badges, and comment previews.
- [x] Drag Gantt labels and Epic headers vertically to reorder or change valid parents, with a separate unparent drop target; keep horizontal schedule dragging separate.
- [~] Add month zoom, grouped/collapsible epic/project/assignee rows, vertical row/group ordering, and synchronized filter/manual-order behavior. (Epic swimlanes, Story-child collapse, and Gantt vertical moves exist; month/project/assignee grouping and shared order rules do not.)
- [~] Add milestones and a separate unscheduled tray with drag-to-schedule using a documented default duration. Keep precise dates editable and keyboard accessible. (Unscheduled rows remain visible with a date-entry prompt; milestones/tray/drop-to-schedule are missing.)
- [~] Render configured weekends, holidays, leave, overdue state, today, progress and visible dependencies. Show useful indicators for dependencies outside the current window/filter. (Weekend, today, progress, and dependency rendering exist; holidays/leave/overdue/out-of-filter indicators do not.)
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
- [~] Let Settings choose task type or a custom attribute as the primary badge source; support colored values, initials, abbreviations/icons and accessible labels consistently across every view. (Task type is the current badge source; custom attribute selection is missing.)
- [ ] Add reusable personal/shared task templates, safe duplication options and advanced bulk application. Reset generated workflow metadata on creation; validate template references against active settings.
- [ ] Extend saved views and dashboard configuration with permissions and stable configuration revisions.
- [~] Build initial historical reports from Change History: throughput, lead/cycle time with documented status definitions, blocked duration, agent claim/review activity, and relevant filters/exports. Do not infer historical actors or transitions that were never recorded. (A v2 history log/retrieval foundation exists; reports and workflow history do not.)

**Acceptance:** each attribute type round-trips through Sheet/app/API with correct validation; option renames preserve assignment; badge meaning does not depend only on color; templates create valid fresh tasks; reports reconcile to known synthetic history and explicitly exclude unavailable legacy history.

### WP-14 — Performance, resilience and release verification

**Dependencies:** starts with WP-00 and accompanies every package; final gate after all required packages. **Requirements:** 16, 17, 19.

- [ ] Build a reproducible 2,000-task dataset with projects, epics, subtasks, dependencies, long descriptions, team calendars and history. Separate summary payloads from lazily fetched detail/history; add pagination/delta reconciliation where justified.
- [~] Batch reads/writes and update only changed fields. Cache reference data by configuration version. Keep locks short without weakening revision/claim guarantees. Virtualize long tables/boards/Gantt rows and redraw only affected content. (Some range operations are batched; changed-field writes, cache invalidation, and virtualization are open.)
- [ ] Measure client feedback, initial usable view and server save completion separately under documented browser, network, account, payload and concurrency conditions. Proposed acceptance: feedback ≤100 ms, usable view ≤3 s, ordinary save ≤2 s; report cold/warm distributions and chosen percentile rather than relying on a single best run.
- [~] Add automated browser workflows, service integration tests and real Apps Script smoke tests in the test environment. Cover permissions, claims, filtered ordering, history, migration, working calendars, retries, keyboard/touch and server failures. (53 Node model/mocked Apps Script tests and a build exist; manual local browser checks cover Gantt/Kanban keyboard moves, batch entry, autosave and undo; no committed browser suite or live Apps Script acceptance.)
- [~] Add CI for domain/service tests, browser checks, build/template integrity and deployment allowlists. Secrets remain in the approved credential store. (GitHub Pages builds the static demo; test/browser/deployment-allowlist CI is missing.)
- [ ] Implement versioned backups with retention, full-project restore and a periodic restore drill; include settings/history/relationships/operational state, not only current filtered task CSV.
- [~] Document supported undo operations and conflict limits, error codes, recovery, native-edit restrictions, API authentication, and release rollback. Record release evidence with source commit, Apps Script version and migration version. (Setup, environment, and auth foundations are documented; the full API/recovery/release evidence is not.)

**Acceptance:** all required workflows pass against the release candidate; migration/restore drills preserve IDs and links; performance targets are met under agreed conditions or explicitly renegotiated with measured evidence before claiming completion; the production release uses the tested source/schema and preserves the intended audience.

## 7. Delivery sequence and release gates

| Stage | Work packages | Current status | Gate still open |
|---|---|---|---|
| Foundation | WP-00 → WP-01 → WP-02 | Partial: app CRUD can use v2 after explicit cutover; migration, rollback, roles and direct-edit validation have local mock coverage. | Prove test/production isolation and migration/role behavior in a real test workbook; complete native-edit reconciliation and recoverable writes. |
| Phase 1: human workflows | WP-03 and WP-04 → WP-05 → WP-06 → WP-07; WP-08 after settings | In progress: quick-add, type badges/settings values, Epic swimlanes, substantial Gantt interactions, scoped Sheet row moves, richer filters and personal saved views exist. | Finish consistent ordering, table grouping, shared saved views, bulk/undo, team/calendar UI and shared move behavior. |
| Phase 1: agent MVP | WP-10 after identity/service/team foundations; WP-09 dashboard integrates available services | Not started: role and schema foundations only; no agent API or claim workflow. | Authenticated agent listing/claims/progress/results, review acceptance, history and actionable dashboard. Phase 1 is not complete without this gate. |
| Phase 2: scheduling/planning | WP-11 → WP-12; complete dashboard capacity panels | Partial: day/week scheduling, dependencies, and Gantt hierarchy interactions exist. | Gantt calendar/milestone/conflict/undo work, work calendars, capacity, and optional rescheduling. |
| Phase 3: customization/reporting | WP-13 | Not started beyond task-type badges and history primitives. | Custom attributes, badge-source selection, templates, saved-view/dashboard configuration, and historical reporting. |
| Every release / final acceptance | WP-14 throughout | Partial: build and 53 local model/mocked server tests pass; quick-add, batch create, autosave, conflict and undo flows have manual local browser checks. | Browser automation, live Apps Script checks, performance evidence, backup/restore, and traceable versioned deployment. |

The immediate next step is to prove the new migration, activation, rollback, role, and native-edit behavior in a separate Apps Script test project and workbook. The v2 app CRUD path is implemented locally but must not be cut over on production without that evidence. Then complete shared ordering/move behavior and add automated browser coverage for save queues and Gantt interactions. Start the agent MVP only after identity, permissions, and team records are verified. The existing Gantt and palette improvements are completed work and should be preserved while closing these gaps.

## 8. Final completion checklist

- [ ] Every row in the requirements coverage table is satisfied by implementation and linked verification evidence; optional features are available through configuration.
- [ ] Existing project data survives migration with stable IDs, relationships, dates and preserved legacy fields.
- [ ] All supported views and the Sheets sidebar use the same rules, defaults, permissions and mutation service.
- [ ] Tasks, epics and groups reorder vertically with consistent scope semantics, persistence, keyboard access and undo.
- [ ] Agent claims, workflow transitions, evidence submission and acceptance are authenticated, revision-safe, idempotent and audited.
- [ ] Native Sheet edits, invalid rows, concurrent changes, transient failures and restores have tested behavior and clear recovery paths.
- [ ] Team capacity, calendars, Gantt behavior, optional rescheduling, customization and reporting meet their documented definitions.
- [ ] The 2,000-task targets and live Apps Script checks have recorded results; passing local mocks alone is not a release sign-off.
