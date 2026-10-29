
# AGENTS.md — GSheetJira Codex Working Agreement

You are developing **GSheetJira / SheetFlow**, a Google Sheets-backed project and task manager with a standalone local browser mode.

The product goal is an exceptionally usable, fast, reliable and visually consistent planning tool inspired by the efficiency of modern tools such as Linear.

## Core priorities

In order of importance:

1. Correctness and data safety
2. Excellent UX and interaction design
3. Speed and responsiveness
4. Simplicity and maintainability
5. Efficient implementation and testing

Favor small, coherent improvements over broad rewrites.

Avoid unnecessary complexity, speculative abstractions, excessive planning and feature expansion outside the approved MVP.

---

## 1. Product documentation and requirements

### Authoritative MVP documents

1. `docs/PRODUCT_REQUIREMENTS_MVP.md`
   - Approved MVP scope, behavior and acceptance criteria.
2. `docs/UI_UX_DESIGN_SPEC.md`
   - Authoritative interaction and visual design contract.
3. `docs/IMPLEMENTATION_PLAN_MVP.md`
   - Implementation phases, dependencies and quality gates.
4. `docs/FUTURE_ROADMAP.md`
   - Deferred and explicitly excluded functionality.
5. `docs/LEGACY_SCOPE_MAPPING.md`
   - Mapping between existing functionality and MVP scope.

Historical documents, when relevant:

- `readme.md`
- `ProductRequiremtns.md`
- `IMPLEMENTATION_PLAN.md`

Do not introduce deferred functionality from historical documents into the MVP.

### Documentation reading policy

At the start of a new conversation or workstream:

- Identify the relevant authoritative MVP documents.
- Read the sections necessary to establish current requirements, UX rules, implementation phase and safety boundaries.
- Inspect relevant architecture and existing behavior.
- Do not assume that context from another conversation is available.

For subsequent related tasks:

- Reuse reliable accumulated context.
- Read only relevant documents or sections.
- Avoid repeatedly loading unchanged documentation.
- Consult historical documents only when resolving ambiguities or investigating existing behavior.
- Never rely solely on remembered requirements when their correctness is uncertain.

The authoritative MVP documents take precedence over outdated conversation context.

### Requirement conflicts

Apply this priority:

**Data safety > MVP functional requirements > UX details > implementation suggestions**

Surface unresolved conflicts.

Never silently change requirements, expand scope or substitute assumptions for documented behavior.

---

## 2. Non-negotiable boundaries

### MVP scope

- Do not implement agentic task workflows in the MVP.
- Codex is the development assistant, not an autonomous task agent integrated into GSheetJira.
- Do not introduce claim APIs, autonomous task orchestration, stale-claim handling or related agent UI.
- Do not implement deferred roadmap features without explicit approval.

### Architecture

Preserve both execution modes:

1. Standalone static/local browser using `localStorage`.
2. Google Apps Script web application using Google Sheets.

Keep behavior consistent across these modes where applicable.

Never imply that local and Google Sheets data synchronize automatically.

Preserve:

- Existing user data and stable IDs
- Parent/child relationships
- Dependency validation
- Ordering semantics
- Conflict safety
- CSV export
- Existing Gantt functionality
- Existing supported workflows

Prefer incremental improvements to the existing dependency-free HTML, CSS and JavaScript architecture, including shared `Core.js`.

Do not introduce React, Next.js, a database, a new bundler, a UI framework or a state-management library without explicit trade-off review and approval.

### Data and deployment safety

Never perform the following without explicit approval:

- Modify production spreadsheets
- Run `setupTracker` on production
- Change the Google Sheets schema
- Perform schema migrations
- Publish an Apps Script deployment
- Execute `clasp push`
- Force-push, merge or push branches
- Change authentication or sharing behavior

Before any approved production operation, verify the target project, spreadsheet and environment.

Schema migrations require a backup, migration tests and a rollback plan.

Never commit credentials, tokens, private spreadsheet IDs, `.clasp` secrets or user data.

### Git working-tree safety

- Inspect relevant Git status and diffs before potentially destructive operations.
- Preserve unrelated uncommitted changes made by the user or other agents.
- Do not overwrite, revert, reset, clean or discard existing work without explicit authorization.
- Never use destructive Git operations merely to simplify implementation.
- Do not stage unrelated files.
- Do not create commits unless requested or authorized by the current workflow.
- Do not switch branches when doing so risks losing or obscuring uncommitted work.
- Never force-push, merge or push without explicit authorization.
- When unexpected changes exist, distinguish them from the current task before modifying overlapping files.
- Do not assume another agent's changes are disposable.

### Generated files

`CoreScript.html` and `dist/index.html` are generated by:

`npm run build`

Rules:

- Edit source files, not generated output.
- Regenerate build output when necessary.
- Review tracked generated diffs.
- Do not silently discard unrelated changes.
- Avoid committing unnecessary build artifacts unless required by the existing project workflow.

---

## 3. Local environment

### Commands

```sh
npm run build
npm test
npm run check
npm start
npm run test:browser
```

- `npm run build` generates `CoreScript.html` and `dist/index.html`.
- `npm test` runs Node tests.
- `npm run check` runs the build and Node tests.
- `npm start` serves the application at `http://127.0.0.1:4173`.
- `npm run test:browser` runs Playwright browser tests.

Node 18+ is documented.

On Windows PowerShell, `npm.cmd` may be necessary:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run check
npm.cmd start
npm.cmd run test:browser
```

The user normally runs Playwright tests locally.

Use `clasp` only for specifically approved and verified Apps Script deployments.

### Application views

- `#sheet`
- `#kanban`
- `#gantt`

### Important source files

- `Index.html` — application shell and forms
- `Styles.html` — styling
- `Client.html` — client interactions
- `Core.js` — shared model and validation
- `Code.js` — server and Google Sheets logic
- `scripts/build.mjs` — standalone build
- `tests/` — Node tests
- `e2e/` — browser tests, when present

These descriptions provide orientation only.

Inspect actual source code before making assumptions about implementation behavior.

---

## 4. Implementation workflow

Work incrementally.

Each user request should normally produce one coherent, reviewable implementation slice.

A single conversation may contain multiple related slices.

Do not automatically proceed to a different slice after completing the current request.

### Step 1 — Understand

Before modifying code:

- Identify the relevant requirement.
- Inspect affected source files and tests.
- Establish existing behavior.
- Identify dependencies and risks.
- Reuse previous findings when still valid.

Distinguish verified behavior from assumptions.

When implementation depends on an uncertain fact, investigate the relevant source instead of inventing details.

Avoid repository-wide investigation when focused inspection is sufficient.

### Step 2 — Plan

Define:

- What will change
- What must remain unchanged
- Acceptance criteria
- Relevant tests
- Important risks, when applicable

Keep planning proportional to task complexity.

For straightforward changes, a short plan is sufficient.

For complex architecture, concurrency, persistence or data-integrity work, explain important trade-offs before implementation.

Do not generate extensive planning documents for trivial work.

### Step 3 — Implement

- Complete the requested slice.
- Make reasonable technical decisions within its approved scope.
- Prefer the simplest maintainable solution.
- Follow existing architecture and coding conventions.
- Avoid unrelated refactoring.
- Avoid speculative abstractions.
- Preserve backward compatibility unless explicitly authorized otherwise.
- Keep changes reviewable and easy to inspect.

The user's request authorizes normal investigation, editing and verification within its scope.

Work autonomously within the approved task scope.

Do not repeatedly request permission for routine implementation decisions.

Request approval for:

- Protected data, deployment or Git operations
- New dependencies
- Significant architectural changes
- Schema changes
- Material expansion of product or task scope
- Destructive operations affecting unrelated work

Do not make unauthorized changes merely because they appear beneficial.

### Step 4 — Verify

Use verification proportional to the change.

Codex may run:

- Focused Node unit tests
- Relevant lightweight integration tests
- Appropriate build checks

Prefer targeted tests during implementation.

Run broader checks such as `npm run check` when:

- Completing a substantial implementation slice
- Changing shared components or infrastructure
- Crossing a phase or release quality gate
- Investigating plausible regressions
- Preparing a broad verification claim

Avoid repeatedly running full checks when no relevant code has changed.

A small isolated change does not automatically require every test.

The user normally runs Playwright browser tests locally.

When persistence, cross-mode behavior or generated output changes, identify the verification required for both standalone and Apps Script modes.

Never claim a test passed unless it actually ran and passed.

Distinguish:

- Implemented
- Unit-tested
- Browser-tested
- Apps Script-tested
- Not yet verified

Successful local browser tests do not establish Google Sheets backend correctness.

### Step 5 — Report

After completing the slice, provide:

- Scope completed
- Files changed
- Important behavior
- Tests actually executed
- Exact local test command when relevant
- Known risks or limitations
- Next action, only if relevant

Keep reports concise and factual.

Do not mark functionality as verified based on visual plausibility or assumptions alone.

---

## 5. Playwright and local testing policy

Preferred browser-testing workflow:

**Codex implements → user runs Playwright locally → Codex analyzes failures → Codex fixes → user reruns.**

### Execution policy

- Do not run full Playwright suites through Codex unless explicitly requested.
- Do not launch interactive browser sessions or repeated screenshot/trace inspections unless explicitly requested.
- Codex may create and maintain targeted browser tests.
- Provide exact commands for the user to execute locally.
- Prefer targeted test files or test-name filters while debugging.
- Avoid rerunning the entire browser suite after every minor change.

### Test maintenance and integrity

- Preserve existing Playwright projects and tests.
- Codex may modify existing test cases and minor test helpers within the requested scope.
- Significant modifications to test infrastructure, Playwright configuration, test dependencies or project-wide testing strategy require approval.
- Do not add new dependencies without approval.

**Never weaken tests merely to make them pass.**

Specifically:

- Never remove, weaken or bypass meaningful test assertions simply to obtain a green result.
- When a test fails, determine whether the implementation or the test expectation is incorrect.
- Update expectations only when justified by approved requirements or verified intended behavior.
- Do not silently skip, disable or delete failing tests.
- Report intentional changes in test coverage or assertions.
- Prefer fixing the underlying defect instead of adapting tests to incorrect behavior.

### Diagnostics

- Prefer concise console output.
- Capture screenshots and traces on failures when supported.
- Prefer disabling video when unnecessary.
- Inspect only relevant failure artifacts.
- Avoid loading complete successful test logs, HTML reports or trace archives into conversation context.
- Before modifying reporting or tracing configuration, inspect the existing Playwright setup.

See `TESTING.md` for local testing instructions.

Local browser testing does not replace Apps Script backend verification.

---

## 6. Conversation context and Codex efficiency

### Preserve useful context

Prefer continuing an existing conversation for related work.

Reuse:

- Architectural understanding
- Implementation decisions
- Debugging findings
- Established requirements
- Relevant knowledge of source files

Multiple related implementation slices may share one conversation.

Keep one clearly defined slice per request.

Do not start a new conversation merely because a slice has been completed.

Start fresh when:

- Switching to a substantially unrelated subsystem
- Existing context has become materially outdated or misleading
- Important implementation state cannot be reliably reconstructed
- Independent analysis would meaningfully benefit the new workstream

Accumulated context is valuable when it remains accurate and relevant.

### Context compaction

Continue after compaction when essential requirements, decisions and implementation state remain available.

If important context is missing:

- Recover it from repository documentation, Git history or relevant files.
- Ask the user only when an essential decision cannot be recovered safely.

Do not restart work unnecessarily.

### Durable project knowledge

Important architectural decisions, implementation status and unresolved issues should survive individual conversations.

Record durable information in relevant repository documentation when necessary.

Prefer updating an existing relevant document over creating another one.

Avoid generating documentation for trivial changes.

### Workstream handoff

When a substantial workstream ends or a conversation becomes unsuitable for continuation, preserve a concise handoff when needed.

Use existing implementation documentation where possible.

Include:

- Current branch and implementation status
- Completed work and outstanding requirements
- Important technical decisions and rationale
- Known defects and unresolved risks
- Tests executed and tests still required
- Recommended continuation point

Do not generate handoff documentation after every small change.

Use Git history and existing project documentation as durable sources of truth.

### Minimize unnecessary tool activity

- Prefer targeted searches over reading entire directories.
- Avoid repeatedly reading unchanged files.
- Avoid repeated repository-wide scans.
- Avoid unnecessary full-file dumps.
- Keep command output concise.
- Avoid large successful test logs.
- Inspect relevant failure details rather than unrelated diagnostics.
- Do not repeatedly investigate already-resolved questions.
- Avoid speculative research without a concrete need.
- Reuse verified information while it remains valid.

Optimize for useful information, not merely the minimum number of tool calls.

Never reduce verification or investigation so aggressively that correctness suffers.

### Reasoning efficiency

Match reasoning effort to task complexity.

Typical guidance:

- Routine CSS and small UI changes: lower or medium reasoning
- Ordinary feature implementation: medium reasoning
- Complex cross-component bugs: higher reasoning
- Architecture, concurrency and data-integrity problems: intensive reasoning when justified

Do not sacrifice correctness or safety to reduce usage.

Reasoning effort is configured in the Codex environment. This document does not override the selected model or effort settings.

---

## 7. UX quality rules

GSheetJira should feel fast, predictable, clean and efficient.

### Design priorities

- Minimal appearance with balanced discoverability
- Consistent visual language
- Strong keyboard and mouse usability
- Clear interaction feedback
- Accessible controls
- Minimal unnecessary interaction steps

### Required behaviors

- Title-only fast task creation
- Common properties directly editable
- Advanced properties available in the details panel
- Preserve focus, selection, filters and scroll position during routine changes
- Use design tokens and accessible semantic colors
- Avoid pervasive tiny text, random colors and duplicate navigation
- Avoid hover-only functionality without keyboard or touch alternatives
- Provide clear feedback for successful and failed interactions

### Dialogs

- Trap focus where appropriate
- Restore focus after closing
- Support Escape correctly
- Preserve unsaved drafts

### Keyboard shortcuts

Preserve existing shortcuts:

- `N`
- `/`
- `1`
- `2`
- `3`
- `Esc`

Handle typing fields, IME composition and modifier keys correctly.

Add new shortcuts only when they do not conflict with existing behavior.

Do not introduce visually attractive interactions that degrade practical usability.

---

## 8. Performance and persistence

Smooth animations are not a substitute for actual speed.

Measure performance under defined conditions, including a dataset of 2,000 tasks.

### Performance targets

- Local feedback p95 under 100 ms
- Loaded-view navigation p95 under 150 ms
- Initial usable view target under 3 seconds
- Typical Apps Script save target under 2 seconds under documented conditions

These are targets, not assumed current performance.

### Performance measurement

Before claiming a performance improvement:

- Establish or identify a documented baseline.
- Compare equivalent datasets and workloads.
- Use comparable hardware and test conditions.
- Record the measurement method.
- Report before/after measurements.
- Identify important variability or limitations.
- Distinguish measured results from estimates.

Do not claim performance improvements based only on subjective impressions or smoother animations.

### Persistence correctness

Display accurate save states:

- Pending / Saving
- Saved
- Failed
- Conflict

A local optimistic update does not imply a successful server save.

On rejected or timed-out edits:

- Preserve the user's draft.
- Allow retry or copying the value.
- Support conflict resolution where applicable.
- Do not silently overwrite newer remote data.

Use:

- Safe mutation ordering
- Targeted rendering
- Debouncing where appropriate
- Efficient updates with minimal unnecessary work

Retain correctness during:

- Failed requests
- High latency
- Rapid successive edits
- Conflicting updates

Performance optimizations must not weaken data integrity.

---

## 9. Phase and release gates

### Phase 0

If Phase 0 has not yet been approved:

- Produce a baseline report.
- Identify risks.
- Establish branch and test plan.
- Do not modify application code until approved.

Once Phase 0 is approved, proceed according to the MVP implementation plan.

Do not repeat Phase 0 unnecessarily for every later task.

### Subsequent phases

- Implement incrementally.
- Keep changes reviewable.
- Maintain meaningful tests.
- Verify acceptance criteria.
- Record unresolved issues.
- Preserve the ability to identify and revert changes.
- Do not silently move incomplete work to a later phase.

Stop and request explicit approval before:

- Adding new dependencies or major frameworks
- Changing the Google Sheets schema
- Expanding approved product scope
- Changing authentication or sharing behavior
- Performing production deployment
- Executing other protected operations defined above

---

## 10. End-of-task report

Use the following format, keeping each field concise:

```text
Scope completed:
Files changed:
Behavior demonstrated:
Tests run and results:
Local browser verification:
Google Apps Script verification:
Performance evidence (if relevant):
Known risks / follow-ups:
Next action (only if relevant):
```

Clearly identify verification not performed.

Prefer factual results to lengthy explanations.

Do not claim completion of requirements that remain unimplemented.

---

## 11. Working philosophy

Build GSheetJira as a professional, reliable, fast planning product.

Favor:

- Correctness over cleverness
- Measured speed over cosmetic speed
- Consistent UX over feature quantity
- Small coherent changes over broad rewrites
- Proven requirements over speculative features
- Reusable context over repeated rediscovery
- Appropriate verification over excessive testing
- Evidence over assumptions
- Safe Git operations over convenience

**Implement the requested slice thoroughly, verify proportionally, report clearly, and stop without expanding scope.**
