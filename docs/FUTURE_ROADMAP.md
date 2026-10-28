# GSheetJira — Deferred Features & Future Roadmap

**Version:** 1.0 · **Date:** 2026-10-28 · **Status:** Idea inventory, **not** MVP acceptance criteria  
**Source of historical ideas:** existing `ProductRequiremtns.md`, `IMPLEMENTATION_PLAN.md`, and design discussions.

## Why this file exists

The old requirements mixed fast personal task management with team planning, scheduling, enterprise permissions and agentic coding. We want to **remember** those ideas while preventing them from delaying the UX/speed-focused MVP.

**Rule:** Nothing here may be implemented merely because it appears in this file. Move it into the MVP PRD only after a separate use case, design, technical risk and acceptance decision.

## A. Agentic coding inside the product — deliberately deferred

**Clarify terminology:** We *are using Codex as the development agent* for GSheetJira. We are **not building an application that automatically assigns work to Codex or other agents** in the MVP.

Possible later stages:

1. **Manual assistant workflow:** human opens a task, copies structured context to Codex, reviews result and updates the task. This requires little or no app integration and may already be useful.
2. **Codex-connected workflow:** app exposes a narrowly scoped authenticated interface for `list_tasks`, `get_task`, task status/progress and result updates; a human deliberately starts coding. Requires real actor authentication, permissions, safe writes, audit and proof-of-transport.
3. **Coordinated agents:** atomic task claims, configurable concurrent workload, stale-claim detection, release/reassignment, dependency guards, evidence submission and human review acceptance. Requires server-side identity, concurrency, permission and idempotency models.
4. **Automation/orchestration:** agents autonomously discover tasks, claim work, prepare branches/PRs, run tests and submit for review. Requires explicit safety, resource and governance boundaries beyond an ordinary task manager.

The old requirements list nine candidate operations: `list_tasks`, `get_task`, `create_task`, `update_task`, `claim_task`, `release_task`, `report_progress`, `report_blocker`, `submit_result`. These are **backlog concepts, not existing public APIs**.

**Suggested future decision gate:** Verify that an authenticated external Codex/client integration is feasible with the actual Apps Script deployment/identity model; prove it against a test workbook before publishing any API. Never assume Google Sheet sharing permissions alone enforce app-level roles.

## B. Team and enterprise collaboration

Possible later modules: validated Team directory, human/agent IDs, admin/editor/viewer/reviewer roles, capabilities, audit trail, shared saved views, activity feeds and assignment policies. Defer until a real multi-user deployment requires them.

**Constraint:** Direct Sheet edit access is a separate permission surface; UI-level roles cannot revoke a collaborator's underlying spreadsheet privileges. Account for this before making enterprise-security claims.

## C. Advanced planning and resource scheduling

Possible later features: holiday calendars, leave and part-day availability, configurable working weeks, team/agent capacity, workload heatmaps, working-day calculations, dependency conflict warnings, automatic rescheduling, milestones and detailed Gantt resource views.

**Keep now:** existing calendar-day Gantt dragging/resizing/dependency display; optional start/due dates and estimates. Do not expand into a schedule solver just to improve the UI.

## D. Configurability and richer hierarchy

- Separate task **hierarchy kind** (epic/story/task/subtask) from **work category** (Algo/Data/Requirements/Bug).
- True recursive subtasks, epic swimlanes, cross-epic moves, independent ordering scopes and configurable workflows/statuses.
- Custom fields (text/number/date/checkbox/select), arbitrary badge sources, user-defined status colors, templates and bulk operations.
- WIP limits, complex grouping, multi-project structures, saved views and flexible dashboards.

These are viable additions, but they can require schema migration, validation updates, history and cross-view rules. They are not permitted as opportunistic extensions of the visual refresh.

## E. Additional UX polish after MVP

Dark/system theme, configurable card fields, advanced keyboard command menus, locale-aware one-line smart parsing (`tomorrow`, `#label`, `!high`, `@person`), user-defined shortcuts, custom dashboards, historical analytics and exports. Prefer user-observed needs and measured interaction improvements.

## F. How to promote an item

Before changing MVP scope, capture:

- **User problem:** concrete repeated pain and scenario.
- **Smallest viable version:** what is the minimum solution that materially helps?
- **Data implications:** changes to the `Issues` sheet, direct Sheet edits, migrations, conflict rules.
- **Security implications:** particularly for agent integration or team permissions.
- **UX placement:** what becomes visible, and what remains optional?
- **Verification:** acceptance tests, performance and rollback plan.
- **Priority:** justified relative to core design/speed work.

Only after review should an item move into `PRODUCT_REQUIREMENTS_MVP.md` or a subsequent version PRD with an explicit delivery phase.

## Source-document interpretation

The existing repository's `ProductRequiremtns.md` and `IMPLEMENTATION_PLAN.md` remain valuable as broader future design references. Their original Phase 1 included full team setup, holidays, agent authentication/claims, extensive ordering and historical logs. **That original phase definition is not the newly agreed MVP**. The focused documents in this pack should govern Codex's immediate implementation work.
