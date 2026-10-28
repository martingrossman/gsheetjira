# GSheetJira — MVP Product Requirements (PRD)

**Version:** 1.0 · **Date:** 2026-10-28 · **Status:** Proposed MVP contract for review and implementation  
**Primary audience:** Product owner, Codex implementer, reviewer/tester  
**Design companion:** [`UI_UX_DESIGN_SPEC.md`](UI_UX_DESIGN_SPEC.md)  
**Delivery companion:** [`IMPLEMENTATION_PLAN_MVP.md`](IMPLEMENTATION_PLAN_MVP.md)

## 1. Product vision and user outcome

Create a **fast, beautiful, lightweight planning tool** inspired by Linear's focus and speed, combined with spreadsheet-style editing and the useful planning depth of Kanban and Gantt. It should let a person manage work with minimal interaction overhead, without forcing them to navigate comprehensive Jira-style forms.

**Product promise:** Open the app, find work, capture new tasks, change priorities/ownership/status, and return to work without delay or uncertainty about saving.

This is initially a **personal/small-project planning tool**. It must keep today's Google Sheets interoperability but is **not** an autonomous software-agent platform, enterprise resource-management suite or universal workflow builder.

### Primary user journeys

1. **Capture:** Add several tasks, in order, using only titles and Enter.
2. **Plan:** Move work between statuses; order tasks and see priorities/ownership.
3. **Edit:** Change a common property without opening an oversized form; open the details panel for complex edits.
4. **Review:** Find tasks using search/filter; use Sheet for bulk inspection and Gantt for scheduling.
5. **Trust:** Know whether changes are local, saving, saved, failed or conflicted; never lose typed data on ordinary failures.
6. **Deploy:** Use the same UI in the standalone/local browser app and in the Google Sheets-backed Apps Script app.

## 2. MVP scope and priority rules

- **P0 (ship blockers):** working current features, clean design foundation, inline add, compact create, usable detailed editor, direct common-property edit, clear persistence states and draft retention, safe local+Sheets compatibility, baseline tests.
- **P1 (strong MVP):** robust search/filtering, keyboard/command palette, improved Kanban and Sheet, consistent Gantt shell, practical context persistence and responsiveness, measured performance.
- **P2 (post-MVP polish):** dark mode, advanced density/card configuration, saved views, bulk editing beyond existing capabilities, larger hierarchy/type changes, smart entry.

**Release sequencing is explicit.** A P1 item must not hold back a safe P0 slice. A P2 item is not mandatory for first acceptance. Existing working features in any tier must not regress or be removed.

## 3. Supported environments (FR-ENV)

| Mode | Must work | Persistence | Explicit limitation |
|---|---|---|---|
| Standalone browser/local (`npm start`, built HTML, GitHub Pages) | Yes, P0 | Existing browser `localStorage` | No collaboration or Sheets synchronization; browser storage is not a durable backup. |
| Apps Script web app | Yes, P0 | Existing Google Sheet `Issues` via Apps Script | May have network/server latency; failures and conflicts must be surfaced. |
| Direct editing in Google Sheets | Preserve, P0 | Native sheet editing, current trigger/validation behavior | Application cannot assume all external edits pass through its UI. |

No native desktop build, external database, hosted API server, remote synchronization between modes or framework migration is required.

## 4. Required functional outcomes

Each requirement has an **ID** so Codex can cite it in implementation reports and tests. P0/P1 are planned targets, not claims of current implementation.

### FR-01 — Workspace and navigation (P0)

- Provide a consistent project/workspace shell with one clear navigation mechanism for **Sheet, Kanban, Gantt**. No duplicate sidebar + top-level tab navigation.
- Compact header and content-first layout; remove the large daily hero and persistent four-card statistics band from main work views.
- Clearly indicate active view, selected epic/project/filter, issue count, backend mode and save state.
- Keep advanced/unimplemented routes out of navigation. An optional overview is not required in P0.

**Accept:** On a 1366×768 desktop, work is visible without first scrolling past a marketing-style welcome section; a switch between the three current views preserves applicable filters and does not reset unrelated work.

### FR-02 — Inline quick task creation (P0)

- The Kanban column and Sheet/new-row surface expose an easy **Add task** action.
- Type a title and press **Enter** to create; title is the only mandatory field.
- Stay in entry mode after successful submission so multiple tasks are easy to capture. Support Esc cancellation.
- Inherit valid context: Kanban column status, selected epic/parent where compatible with **existing** hierarchy rules, existing type/priority defaults. Allow editing later.
- Provide immediate UI feedback while saving, but label unsynced data honestly. Do not clear the only copy of failed input.

**Accept:** Create three tasks consecutively without opening/reopening the detailed editor; each is persisted exactly once, with the correct status and title, or its failed draft is recoverable. For slow/failed network conditions the interface distinguishes pending from saved.

### FR-03 — Compact Quick Create (P0)

- A centered, content-height creation dialog with focused title, optional description and compact controls for type, priority and context-appropriate status/assignee/due date.
- Hide rare fields behind **More options**. The extended panel must not lose values entered in compact mode.
- A visible Create button and working keyboard flow. Preserve `N` shortcut; a new `C` shortcut may be added if not conflicting.
- Close/cancel must be predictable and warn only when entered content would be lost.

**Accept:** Open from the main New control or shortcut; enter a title; submit; see task. All required validation/errors are accessible without using the full drawer.

### FR-04 — Detailed task editor (P0)

- Existing task opens a side panel with summary/ID, frequently changed properties first, and logically organized advanced sections.
- Keep support for all existing fields: description, type, status, priority, parent, assignee, reporter, dates, estimate, time spent, progress, sprint, labels, dependencies and metadata.
- Show save state, validation errors and conflict recovery. Never silently lose a draft during navigation or a failed request.
- Preserve existing reference/deletion checks; destructive actions remain explicit.

**Accept:** Update an advanced field, reload and confirm persistence; simulate a rejected save and confirm the value is retained for retry/copy rather than disappearing.

### FR-05 — Kanban (P0–P1)

- Keep existing status columns and drag/drop status + vertical ordering capabilities.
- Default cards show **title, ID/type marker, priority and assignee**; optionally show due date, blocker/dependency indicators only when data exists.
- Change priority/assignee through direct card interactions; keyboard and touch must have alternatives to drag/drop/hover.
- Inline create is accessible per column; maintain clear insertion indicators and sensible empty states.
- Keep filtering, card focus and ordering behavior correct when data updates.

**Accept:** Change status by drag/drop and by a non-drag interaction; change priority without opening full details; refresh and confirm state/order. No duplicate or lost task during reorder failures.

### FR-06 — Sheet view (P0–P1)

- Preserve editable table, current sorting/filtering and direct access to details.
- Make text and metadata legible; use sticky headers and, where feasible, a pinned identity/title column.
- Efficient keyboard movement, cell edit, Tab/Enter behavior and direct property selection; avoid re-render-induced focus loss.
- Preserve values on failed inline saves. Support a clear new-row/quick-add path.
- Keep export CSV working and safe.

**Accept:** Edit several cells with keyboard and mouse; sorting remains correct; a failed edit is visible/retryable instead of reverting with no warning; filtered CSV export remains functional.

### FR-07 — Timeline / Gantt (P0 preserve, P1 refine)

- Keep current day/week views, task bars, drag-to-shift, right-edge resizing, dates, progress, dependencies, today/weekend markers and unscheduled-task access.
- Align labels, controls, tooltips, focus and spacing with the refreshed interface.
- Save schedule edits through existing validation/error handling and preserve calendar-day behavior unless intentionally changed in a separately approved task.

**Accept:** Move and resize bars, reload and confirm dates; filter and navigate without broken bar geometry or lost selection. No automatic rescheduling or leave-calendar engine is required.

### FR-08 — Search, filters and context (P1)

- Search by ID and title; description when already supported. Use one search entry point and consistent filter semantics across views.
- Preserve the current type/status/assignee/sprint/epic filters; show active filters clearly and offer a one-click reset.
- Filter changes must not mutate data or corrupt manual ordering. Preserve reasonable scroll/focus/selection context when switching loaded views.
- Optional advanced saved views are P2.

**Accept:** A given filter combination returns the same matching task set in Kanban, Sheet and Gantt (subject to each view's rendering rules) and can be reset easily.

### FR-09 — Keyboard productivity (P1)

- Preserve existing shortcuts: `N` new, `/` search, `1` Sheet, `2` Kanban, `3` Gantt, `Esc` close/cancel.
- Add `Ctrl/Cmd+K` command palette for navigation, create and finding tasks. Contextual shortcuts for property edits are optional until consistent focus/selection is implemented.
- Shortcuts do not fire while typing in a text control, composing IME text or using accessibility-relevant modifier combinations.
- All important actions must also be discoverable with mouse/touch; show shortcuts in Help/menus.

**Accept:** Common navigation and creation are operable without a mouse; no unexpected view switching while typing a title/description.

### FR-10 — Persistence and integrity (P0)

- Show distinct states: **Not yet saved/Pending**, **Saving**, **Saved**, **Failed**, **Conflict**. In local mode use an accurate local-saved indication, not a cloud-sync checkmark.
- Never claim server success before it is acknowledged. Preserve entered data on timeouts and validation failures; offer Retry/Resolve/Copy where feasible.
- Avoid silently overwriting remote changes. Maintain existing conflict/version checks; server-side validation remains authoritative.
- Protect stable task IDs, parent and dependency rules, required title, correct dates, status transitions already supported, and existing delete protections.
- Do not introduce schema changes merely to redesign the UI. Back up before any later approved migration.

**Accept:** A test network failure, stale-version conflict and rapid successive edits each yield an understandable state with recoverable user content. No silently duplicated task from retries.

### FR-11 — Appearance and accessibility (P0–P1)

- Follow [`UI_UX_DESIGN_SPEC.md`](UI_UX_DESIGN_SPEC.md): neutral/indigo design, semantic statuses, clear focus, readable body text, consistent spacing and components.
- Comfortable default density; optional Compact after accessibility verification. Dark/system theme is P2.
- Use semantically labeled controls, keyboard-accessible dialogs, proper focus restoration and motion reduction. Target WCAG 2.2 AA on applicable flows.
- Desktop-first but usable on narrow screens and touch devices; never depend on hover alone.

**Accept:** Keyboard-only smoke test of navigation, quick-create, editing and modal close; contrast/focus checks; mobile layout does not obscure essential actions.

### FR-12 — Responsiveness and performance (P0 baseline, P1 optimize)

- Benchmark local user feedback independently of Google Sheets network round trips.
- Minimize unnecessary full re-renders; preserve focus and scroll. Use safe, targeted optimistic updates if backend guarantees support them.
- Favor shared loaded data, batching and debounced text saves without relaxing validation/concurrency.

**Targets (to be measured; not existing results):** local feedback p95 under 100ms; loaded-view navigation p95 under 150ms; initial usable view target under 3s; normal Apps Script save target under 2s, all under documented test conditions. Include 2,000-task data, realistic card distribution and slower-network scenarios. Record metrics rather than asserting success.

## 5. Data and model boundaries

### Existing schema is the MVP compatibility contract

The existing `Issues` sheet has 21 columns; `Core.js` defines: types **Epic, Story, Task, Bug**; statuses **Backlog, To Do, In Progress, Review, Done**; priorities **Highest, High, Medium, Low, Lowest**. `parentId` supports the current parent restrictions, and `rank` controls order. Preserve these now.

Important distinction for later: **hierarchy kind** (epic/story/task/subtask) and **work category** (Algo/Data/Requirements/Bug) are separate concepts. Do not disguise a structural migration as an interface redesign. Document a proposed future model, but defer a schema rewrite until the need and migration plan are approved.

### No invented features

- Do not expose `Ready` or `Blocked` as functional states just because the old requirements mention them; that needs schema/workflow decisions.
- No agent statuses, agent claims, reviewers, authenticated API or Git integration in the MVP.
- Do not promise synchronized local↔Sheets data, native offline collaboration, full team capacity, partial-day scheduling, arbitrary custom fields or cross-epic drag semantics unless implemented and tested.
- Existing implemented advanced behavior (drag ordering, Gantt dependencies) remains supported even if the broader feature family is deferred.

## 6. MVP non-goals

Autonomous agent execution/orchestration; Codex integration inside the app; multi-user enterprise authorization; capacity and time-off calendars; working-day schedule engine; automatic dependency rescheduling; configurable arbitrary data types and badges; advanced reporting; natural-language task parsing; large schema refactoring; new frontend framework. See [`FUTURE_ROADMAP.md`](FUTURE_ROADMAP.md).

## 7. Release acceptance scenarios

Use these as end-to-end acceptance anchors (all P0, then relevant P1 scenarios):

| ID | Scenario | Required outcome |
|---|---|---|
| AT-01 | Create 3 tasks using inline Enter | All three appear in correct context and persist exactly once; entry remains fast. |
| AT-02 | Open compact create from New / `N` | Title-only submission works; advanced options are not required. |
| AT-03 | Change priority from board card | One direct action, keyboard alternative, persists and reappears after refresh. |
| AT-04 | Open/edit detailed issue | Existing metadata remains available; successful edits persist. |
| AT-05 | Simulate failed Sheet write | User's draft is retained and marked failed; Retry/Copy/Resolve is usable. |
| AT-06 | Simulate stale-version conflict | No silent remote overwrite; user can understand and resolve. |
| AT-07 | Move/reorder task in Kanban | Status/order persist; accessible non-drag fallback; no corruption under filter. |
| AT-08 | Edit Sheet cell and export | Keyboard editing works; filtered CSV export matches visible selection criteria. |
| AT-09 | Move/resize scheduled Gantt item | Expected dates are preserved/persisted; no regression in dependencies. |
| AT-10 | Local versus Apps Script mode | UI identifies mode honestly; each mode's persistence works as documented. |
| AT-11 | Keyboard and mobile smoke | Focus, Escape, search, view keys and touch create/edit are usable. |
| AT-12 | 2,000-task benchmark | Measurements and conditions recorded; regressions investigated and budgets reported honestly. |

## 8. Success signals

Measure *actual task completion friction*: clicks/keystrokes for common actions, median/p95 local response, successful saves, recoverable failures, keyboard completion, mobile usability and visual consistency. A beautiful screenshot is not enough; an untested fast-looking UI is not enough.

## 9. Scope and change control

Changes to P0/P1 requirements require an explicit PRD update and product decision. Keep the original repo requirements intact for reference until the new docs are accepted and a clear migration/archival decision is made. A Codex coding run should cite requirement IDs in its summary and never silently promote roadmap ideas into the MVP.
