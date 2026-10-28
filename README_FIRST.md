# GSheetJira — MVP Design & Delivery Pack

**Version:** 1.0 · **Prepared:** 2026-10-28  
**Repository:** https://github.com/martingrossman/gsheetjira  
**Reference:** `main` at `7a2609df91423b5ffa98bdbcb0c6fc26ae6aceb4` (inspect latest HEAD before coding)  
**Decision:** A fast, Linear-inspired planning tool; **not** an autonomous agent platform in the MVP.

## Start here

This pack is deliberately split into distinct contracts. The files are intended to be copied to the indicated paths in the existing repository.

| File | Question it answers | Authority |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | How should Codex work safely in this repo? | Coding workflow and guardrails |
| [`docs/PRODUCT_REQUIREMENTS_MVP.md`](docs/PRODUCT_REQUIREMENTS_MVP.md) | **What** is in/out of the MVP, and how do we know it works? | Product scope and functional acceptance |
| [`docs/UI_UX_DESIGN_SPEC.md`](docs/UI_UX_DESIGN_SPEC.md) | **How** should every common interaction look, feel and behave? | Visual/interaction contract |
| [`docs/IMPLEMENTATION_PLAN_MVP.md`](docs/IMPLEMENTATION_PLAN_MVP.md) | **In which order** should Codex build/test/release it? | Sequencing, engineering acceptance and risks |
| [`docs/FUTURE_ROADMAP.md`](docs/FUTURE_ROADMAP.md) | Which attractive ideas are intentionally deferred? | Explicitly non-MVP ideas |
| [`docs/LEGACY_SCOPE_MAPPING.md`](docs/LEGACY_SCOPE_MAPPING.md) | How do the original 20 requirement sections map to the new MVP? | Scope reconciliation reference |

**Priority when docs appear to conflict:** safety, data integrity and existing deployed data first; then MVP product scope; then UI/UX interaction details; then the implementation plan. `AGENTS.md` governs the coding process. The existing root `ProductRequiremtns.md` and `IMPLEMENTATION_PLAN.md` are retained as historical/broader planning documents, but **do not expand the agreed MVP**. Record conflicts instead of silently choosing a new scope.

## Product in one sentence

> A beautiful, keyboard-friendly and exceptionally responsive task manager with Sheet, Kanban and Gantt views, usable as a local/browser app and as a Google Sheets-backed Apps Script app.

**Design formula:** minimal visual appearance + balanced visible functionality + power-user interaction speed.

### In the MVP

- Compact, accessible workspace; consistent indigo/neutral design; readable typography.
- Inline title + Enter task creation, compact Quick Create, organized detailed editor.
- Fast inline property editing; keyboard-first navigation and search.
- Existing Sheet, Kanban and Gantt functionality preserved and improved.
- Visible save/sync/failure feedback, draft retention, retry and conflict-safe behavior.
- Both existing execution modes: standalone demo/local browser and Google Sheets/Apps Script.
- Measured performance against realistic datasets, including 2,000 tasks.

### Not in the MVP

Autonomous coding agents, task claiming/agent API, multi-agent coordination, enterprise permissions, team capacity and leave management, working-day scheduling, automatic dependent-task rescheduling, a general custom-field engine, and elaborate analytics. **Using Codex to develop this app is encouraged; making the app orchestrate Codex is deferred.**

## Repository placement

Copy the contents of this pack into your repo root:

```text
gsheetjira/
├── AGENTS.md                        # new: Codex instructions
├── docs/
│   ├── PRODUCT_REQUIREMENTS_MVP.md  # new: focused MVP contract
│   ├── UI_UX_DESIGN_SPEC.md          # new: design/interaction contract
│   ├── IMPLEMENTATION_PLAN_MVP.md    # new: phased engineering plan
│   ├── FUTURE_ROADMAP.md            # new: deferred scope
│   └── LEGACY_SCOPE_MAPPING.md      # new: original → MVP mapping
├── ProductRequiremtns.md            # existing: preserve, broader historical scope
├── IMPLEMENTATION_PLAN.md           # existing: preserve, broader historical review
├── Core.js · Code.js · Client.html · Styles.html · Index.html · ...
```

Do **not** overwrite the original requirements/review in the first pass. The new files explicitly supersede their *MVP scope*, not their value as a future backlog.

## The first Codex instruction (copy/paste)

> Read `AGENTS.md`, `docs/PRODUCT_REQUIREMENTS_MVP.md`, `docs/UI_UX_DESIGN_SPEC.md`, `docs/IMPLEMENTATION_PLAN_MVP.md`, `docs/FUTURE_ROADMAP.md`, and `docs/LEGACY_SCOPE_MAPPING.md`. Inspect the current repository and compare it with this documentation. Start with **Phase 0 only**: report the current baseline, known bugs, test coverage, local/Apps Script architecture, risks, and proposed small PR-sized implementation slices. Recommend a new branch and a precise Phase 1 change list. **Do not modify application code, deploy, change Sheets schema or push to remote in this first step.** Produce `docs/PHASE_0_REVIEW.md` with findings, baseline checks and a proposed implementation order. Wait for approval before implementing Phase 1.

Once Phase 0 is approved, ask Codex to implement **one slice at a time** with tests, screenshots, notes about local and Sheets modes, and measured results (where applicable).

## High-value first end-to-end slice

Create a task in a Kanban column using title + Enter → see the task immediately → change its priority on the card → open the details drawer → edit its description → observe save/sync state → reload and verify persistence. Repeat with an intentional save failure and conflicting update. This tests the core vision without requiring an app rewrite.

## Clarifications and limitations

- The **current local build** is a static browser app backed by browser `localStorage`; it is not a native desktop application and **does not sync with Google Sheets**.
- The shared version uses Google Apps Script and an `Issues` sheet. Both need equivalent UX but have different persistence latency and error conditions.
- Performance budgets in these files are **targets**, not measured achievements or network guarantees.
- This document pack changes no application code and makes no deployment. Review the installed branch and production/test Sheets target before any later `clasp` command.
