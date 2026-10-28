# GSheetJira — MVP Implementation Plan for Codex

**Version:** 1.0 · **Date:** 2026-10-28 · **Status:** Sequenced plan; code not modified by this document  
**Reference baseline:** `main` commit `7a2609df91423b5ffa98bdbcb0c6fc26ae6aceb4`; verify actual working HEAD.  
**Contracts:** [`PRODUCT_REQUIREMENTS_MVP.md`](PRODUCT_REQUIREMENTS_MVP.md) and [`UI_UX_DESIGN_SPEC.md`](UI_UX_DESIGN_SPEC.md)  
**Coding rules:** [`../AGENTS.md`](../AGENTS.md)

## 1. Engineering objective

Improve the existing GSheetJira in small, independently reviewable slices. Ship **one consistent Linear-inspired task experience** with fast capture/editing, coherent Kanban/Sheet/Gantt, strong keyboard support, verified persistence, and measured performance. Keep the current dependency-free browser frontend and Apps Script/Sheets backend unless evidence proves a focused change necessary.

**Not the engineering objective:** building a multi-agent scheduler, migrating to a new SaaS stack, rewriting all source at once, or redesigning the data schema under cover of styling changes.

## 2. Observed baseline and known gaps (revalidate in Phase 0)

| Component | Existing project evidence | MVP action |
|---|---|---|
| `Index.html` | Sidebar, duplicate view navigation, large welcome/stats area, full issue form in right drawer | Simplify shell and separate quick-create from details |
| `Styles.html` | Dense CSS; predominantly olive/green color system and many small labels | Introduce semantic tokens, consistent layout and legibility |
| `Client.html` | Sheet/Kanban/Gantt rendering, `openIssue`, shortcut handling, save helpers | Extract or isolate UI workflows; improve focus/render/save behavior |
| `Core.js` | Shared fixed fields/types/statuses, stable ID domain rules, parent/dependency checks | Preserve core contracts; avoid schema expansion |
| `Code.js` | Apps Script and Sheets reads/writes, locking, version checking | Preserve validation; optimize cautiously; avoid production-data risks |
| `scripts/build.mjs` | Generates `CoreScript.html` and `dist/index.html` | Keep generated outputs in sync; test standalone build |
| `tests/` | Node-based tests exist; broader implementation review reported 28 passing at its review date | Run current tests yourself; add browser and failure cases |
| `readme.md` | Local/browser and Apps Script deployment instructions | Update only after verified behavior changes |

**Risks called out by the older implementation review** (not independently reproduced here): failed inline Sheet save may redraw the old value and lose a user's draft; `persist` can globally block during server saves; full view re-renders can lose focus and add latency; server save path reads broadly; direct Sheet edits may bypass full validation. Validate these before changing persistence. Prioritize draft loss as a **P0** bug.

### Current storage/deployment constraints

- The existing Sheet schema is a 21-column `Issues` tab; do **not** migrate it in the visual refresh.
- Standalone build stores data in browser `localStorage`; it does not sync to Sheets.
- Apps Script web app uses `google.script.run`; edits may be visible in Sheets only after server acknowledgment.
- `.claspignore` currently allowlists specific source files; adding source modules requires an explicit deployment/build check.
- Existing shortcuts `N`, `/`, `1`, `2`, `3`, Esc must continue to work.

## 3. Release strategy and work packages

Use a **new feature branch** from a reviewed base (e.g. `feature/mvp-ux-speed`). Take baseline screenshots and note deployed mode before modifying. Do not modify production Sheets, deploy, push or merge without user approval.

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 | Review and baseline, risk register, tests/measurements, proposed PR slices | User approves scope and approach; **no app code changes** |
| 1 | Visual system and simplified workspace | Visual snapshots + existing behavior tests pass |
| 2 | Fast create, editor and save/error states | Repeated-create + failed-save end-to-end tests pass |
| 3 | Board, Sheet and required Epic swimlanes (P1) | Card/cell workflows, Epic grouping/moves and keyboard tests pass |
| 4 | Navigation, command palette, filters and Gantt consistency | Cross-view and keyboard tests pass |
| 5 | Performance, accessibility, hardening and release | Documented benchmarks + local/Sheets smoke checks |

Each phase can contain several small PRs. Re-evaluate whether advanced P1 items fit the timeline; do not force them into one release if they compromise P0 quality.

## 4. Phase 0 — Audit, safety baseline and actionable design review

**Codex is authorized to inspect and document only until the user approves the first code slice.**

Tasks:

1. Confirm current branch, `git status`, HEAD and actual project structure. Do not assume the baseline commit still matches current code.
2. Run `npm run check` (or Windows `npm.cmd run check`) and report commands/results. Do not invent passes if tools fail.
3. Run local app (`npm start`) and inspect desktop (1366×768, 1440×900) and narrow mobile (~390px). Record screenshots if browser tooling is available; otherwise specify what was not tested.
4. Diagram create/edit/save paths for standalone and Apps Script mode, including retry/conflict behavior. Identify where full rendering occurs and how focus, selection, scroll and drafts are currently stored.
5. Audit current keyboard shortcuts, current dialog, filter persistence, card editing, drag/reorder and Gantt behavior.
6. Create a test plan for a 2,000-task realistic dataset, slow/error response simulations and interaction timing; collect baseline measurements where possible.
7. Create `docs/PHASE_0_REVIEW.md`: implemented/partial/missing matrix against the new PRD, top defects by severity, suggested small work packages, risks/assumptions, blocked items and proposals requiring approval.

**Gate P0-GATE:** reviewer approves a small Phase 1 slice. No production schema, backend or deployment modifications at this gate.

## 5. Phase 1 — Design foundation (visual refactor without semantic changes)

**Objective:** one restrained visual language and one navigation model. Do not combine with server changes.

Suggested small slices:

- **P1.1 — Tokens:** establish semantic palette, fonts, spacing, radii, focus, states, contrast; replace hardcoded olive/green variants in actively touched components. Keep color meaning consistent.
- **P1.2 — Workspace shell:** compact sidebar/header, remove duplicate view navigation, shrink hero/stats from everyday work surfaces, preserve direct view hashes/links.
- **P1.3 — Shared controls:** standard buttons, inputs, chips, menus, cards, dialogs, status indicators, tooltips and responsive breakpoints; prefer reusable CSS patterns without introducing a frontend framework.
- **P1.4 — Accessibility baseline:** document keyboard order, focus visibility, mobile overflow and reduced-motion behavior; fix obvious regressions.

**Acceptance:** screenshots reviewed; switching all three views works; no lost navigation state or broken existing dialog; `npm run check` passes; local demo works; Apps Script template placeholders/build remain valid. Do not claim Sheets deployment verification unless actually performed.

## 6. Phase 2 — Task capture, details and trustworthy feedback

**Objective:** remove the creation bottleneck and prevent lost work before any additional power features.

Small slices (in recommended order):

1. **P2.1 — Failed edit retention first:** reproduce the suspected inline-save data loss; create failure-injection test; retain local draft and give retry/copy/conflict path. Improve save-state modeling if needed. Avoid simultaneously changing underlying schema.
2. **P2.2 — Inline Kanban Add:** column-specific title input; Enter create; context defaults; ready for next; pending/success/error; accessible form. Account for overlapping operations and duplicate retries.
3. **P2.3 — Compact Quick Create:** split new-task flow from current full drawer; small modal with title and compact controls; `N` preserved; keyboard/focus/trap/IME and discarded-draft behavior tested.
4. **P2.4 — Organized detailed editor:** maintain all current fields, reorganize into clear groups, expose primary props first, protect pending edits and child-navigation.
5. **P2.5 — Direct card priority editing:** simplest high-frequency card edit, properly isolated from opening/dragging. Assignee follows using same pattern.
6. **P2.6 — Sheet quick-add:** single-line title creation, preserve context and safe keyboard behavior.

**End-to-end acceptance slice:** add 3 tasks in Kanban → change priority → edit description in drawer → refresh/reopen → verify all changes. Repeat using delayed, failed and conflicting saves. Test local and Sheets modes. Both UI state and backend write result must agree; never show `Saved` prematurely.

**Implementation caution:** Optimistic rendering should not bypass `Core.js` validation or the backend's version checks. If a server call can have an ambiguous result on timeout, do not blindly retry create without deduplication: retain draft, reconcile by stable operation identity if such support is added and approved, or require a safe user-assisted recovery procedure.

## 7. Phase 3 — Kanban and Sheet productivity

- **P3.1 — Kanban card layout:** default title/ID/type/priority/assignee; conditional date and dependency, accessible context menus, consistent spacing and column widths.
- **P3.2 — Direct edits:** assignee, status and priority from cards with focus/touch alternatives; retain drag/drop and ordering semantics.
- **P3.3 — Sheet ergonomics:** sticky header/identity column if feasible, legible density, in-cell selects, Tab/Enter focus, and persistent failure state/drafts.
- **P3.4 — Order and filters:** verify drag reorder across filtered/sorted views against existing rules; accessible Move action. Defer cross-view *Epic-group reorder engine*; Epic grouping and legal cross-Epic task moves below **are required**.
- **P3.5 — Required Epic swimlanes:** Add flat/Epic grouping selector with persisted per-browser preference; render aligned status columns in collapsible Epic lanes plus `No Epic`; show filtered task counts separately from overall Done/total leaf-work progress. Resolve ancestry from current `parentId` without schema migration. Support contextual create, status moves, and legal Epic moves with accessible non-drag alternatives. For Story-nested children, require explicitly confirmed detach/reparent or explain why move is invalid. Keep combined status/Epic changes validated, recoverable and conflict-safe. Verify filter/order behavior and local/Apps Script persistence. Defer assignee/project grouping and lane reordering.
- **P3.6 — Compact/Comfortable:** optional density toggle, accessible on desktop and touch devices.

**Acceptance:** same task edited from board and table produces consistent results; pending updates don't scramble the card list, filter or selection; no regression in existing CSV export, date validation, dependency cycles or deletion guard. Pass PRD AT-13 for Epic grouping and safe cross-Epic moves.

## 8. Phase 4 — Navigation, command palette and timeline consistency

- **P4.1 — Shortcut contract:** preserve existing keys; prevent triggers in text fields/IME; visible key help.
- **P4.2 — Command palette:** Ctrl/Cmd+K to search issues and trigger New, view switching, focus search; don't add unfinished commands.
- **P4.3 — Search/filter toolbar:** unified search and active filters, one-click clear, share applicable filters across views. Avoid changing underlying task query semantics without tests.
- **P4.4 — Gantt shell:** unify typography/toolbars/tooltips, ensure drag/resize and dates still work. Do not implement working-day calendars, leave/capacity models or automatic rescheduling.
- **P4.5 — Responsive behavior:** narrow screens, horizontal board/timeline scroll, mobile full-screen editor, discoverable touch actions.

**Acceptance:** keyboard-only journey, mobile smoke, cross-view filters and deep links; existing Gantt moves, dependency lines and unscheduled tasks remain usable.

## 9. Phase 5 — Performance, resilience, accessibility and release

### Benchmark protocol

Create a deterministic fixture with **2,000 tasks** and realistic distributions of status, parent relationships, assignees, due dates, longer descriptions and dependencies. Test representative 100/500/2,000 task sizes. Record:

- Environment: device/CPU, browser/version, viewport, app mode, network conditions and backend dataset.
- Metric: p50/p95; interaction start → first meaningful feedback; loaded view navigation; drag preview; search latency; initial usable view; Sheets save completion separately.
- Actions: create, rename, edit priority/assignee, filter, switch views, scroll Sheet/Gantt, drag/drop and retry after simulated failures.
- Report regression vs Phase 0 baseline when data exists. Do not claim compliance from a single run or subjective smoothness.

**Targets (not guarantees):** local action feedback p95 <100ms; loaded-view switch p95 <150ms; first usable view target <3s; typical Sheets save target <2s under controlled conditions. When Google Apps Script latency makes a save budget unreliable, document measured percentiles and ensure the UI stays responsive with truthful save state.

### Safe optimization order

1. Eliminate unnecessary whole-view redraws and focus/scroll losses.
2. Move repeated computed data out of hot rendering paths; reuse cached/filter results correctly.
3. Batch appropriate reads/writes; debounce text edits; avoid save per keystroke.
4. Refactor server write path only with integration coverage and an explicit data-safety design. The previous plan noted whole-sheet reads/writes; fix with measurements and conflict semantics intact.
5. Add virtualization only where benchmarks show it is needed; handle keyboard selection, sticky columns, accessibility and scroll anchoring.
6. Test failure/retry, conflicting edits and rapid repeated mutations after optimization.

### Release gate

- `npm run check` passes (or failures investigated and documented).
- Browser smoke tests on Chromium and at least one additional engine if feasible; desktop/mobile views captured.
- Apps Script smoke tests performed in **separate test Sheet/script environment** before production; test ID/schema preservation and direct Sheet edits.
- Preserve/provide rollback instructions, backup/restore, branch/commit, release version and target environment.
- Clear performance summary and known limitations in changelog. Production deploy is a **separate explicit authorization step**.

## 10. Specific regression matrix

| Risk area | Verify after relevant change |
|---|---|
| Create | No blank title, correct defaults, no duplicates on retries or double-click |
| Edits | Inline save failure draft retention, separate pending/success, stale version conflict |
| Hierarchy | Existing Epic/Story/Task/Bug parent rules and linked deletion constraints; no implicit detach of Story children |
| Dependencies | Valid IDs only, no cycles, Gantt dependency display remains correct |
| Order | Kanban move within/across columns and Epic lanes; hidden filtered tasks retain appropriate order |
| Sheet | Native Sheets entry, ID/timestamps trigger behavior, CSV export unaffected |
| Epic swimlanes | Flat/Epic toggle persists; No Epic, collapse, counts, leaf progress, contextual add, legal cross-Epic moves, non-drag equivalent and 2,000-task responsiveness |
| Gantt | Drag shifts dates, resize changes end only, unscheduled tasks stay findable |
| Views | `#sheet`, `#kanban`, `#gantt`, `/` search, `N`, `1`, `2`, `3`, Esc |
| Local | Sample data, localStorage persistence, static build, Github Pages compatibility |
| Cloud | Apps Script template, `google.script.run` errors, real Sheets save/reload, direct edit reconciliation |
| Accessibility | Labels, keyboard focus, IME, focus trap/return, drag alternatives, reduced motion |

## 11. PR/commit review template

Every Codex task or PR must contain:

```text
Title: [Phase] concise change, e.g. [P2.2] Kanban inline title+Enter
Requirements: FR-02, FR-10; AT-01, AT-05
Scope: what changed and what remains explicitly out of scope
Touched files: ...
Before/after screenshots: ... (where visual)
Tests: exact commands and pass/fail; browser mode(s) checked
Risk/failure checks: delayed save, timeout, retry, conflict, focus/scroll
Data/schema changes: none, or approved migration/rollback reference
Performance: measured vs baseline, or not applicable
Known limitations and next suggested small slice: ...
```

Keep commits/reviews focused. Avoid vague reports such as “refactored UX” without observed behavior or executable evidence.

## 12. First prompt to Codex

Use this for the initial run; **do not ask Codex to implement the entire plan in one go**.

> Read `AGENTS.md`, the new MVP PRD, UX specification, implementation plan and future roadmap. Compare them with the actual current repository and its historical requirements. Perform Phase 0 only: inspect files, verify the branch, run available tests, outline local/Apps Script save behavior, identify current UX defects, and prepare a short implementation sequence with PR-sized slices. Write `docs/PHASE_0_REVIEW.md`. Do not change application code, schema, dependencies or deployments yet. Wait for my approval before Phase 1.

After approval, give Codex one slice ID (for example `P1.1`), require its exit checks, review the output, and then move on.
