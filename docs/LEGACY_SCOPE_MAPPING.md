# Scope Mapping — Original Requirements to Focused MVP

**Purpose:** Prevent Codex from accidentally implementing the much larger legacy requirements during the current design/speed workstream. The existing `ProductRequiremtns.md` remains in the repo for reference. This mapping is **not** a new feature backlog.

| Original section | Current MVP decision | Notes |
|---|---|---|
| 1. Purpose | **Keep, narrow** | Fast planning tool; agentic tasks removed from MVP. |
| 2. Architecture | **Keep existing modes** | Sheets/Apps Script, standalone browser; no six-sheet schema migration. |
| 3. Task data model | **Keep existing 21 columns** | No agent metadata, new statuses, or project/category migration in redesign. |
| 4. Fast creation/editing | **MVP priority** | Title + Enter, inline edits, compact create, safe drafts. |
| 4.1 Vertical reordering | **Preserve implemented Kanban** | Defer full epic/group and cross-view reorder engine. |
| 5. Task list | **MVP priority** | Legibility, keyboard editing, quick add; advanced saved views later. |
| 6. Kanban | **MVP priority** | Cards, movement, direct edits and keyboard/touch alternatives. |
| 6.1 Swimlanes | **Required MVP (P1): Epic grouping** | Flat/Epic toggle, collapse, No Epic, counts/progress and safe validated status/Epic moves; no generic grouping or schema migration. |
| 6.2 Filters | **Keep core; refine UX** | Existing filters across views and clear active-state indicators. |
| 7. Gantt | **Preserve and polish** | Keep existing drag/resize; defer scheduling engine. |
| 8. Team/capacity | **Defer** | Existing free-text assignee remains initially. |
| 9. Holidays/availability | **Defer** | No working-day or partial-day capacity calculations. |
| 10. Task types/settings | **Defer model migration** | Current Epic/Story/Task/Bug retained; redesign via CSS only first. |
| 11. Custom attributes/badges | **Defer** | Simple current metadata/type markers only. |
| 12. Dashboard | **Simplify** | Remove intrusive stats from workspace; future optional Overview. |
| 13. Agentic workflow | **Out of MVP** | Codex builds product externally; product does not orchestrate Codex. |
| 13.1 Agent status flow | **Out of MVP** | Existing status enum unchanged. |
| 14. Agent integration API | **Out of MVP** | No public/authenticated task agent endpoint. |
| 15. Integrity/concurrency | **Keep necessary safety** | Preserve IDs/version/dependencies and safe failures. |
| 16. Performance | **MVP priority** | Measured local responsiveness and real Sheets latency. |
| 17. Reliability/history | **Keep essential recovery** | Drafts, errors, conflicts; full audit/history later. |
| 18. Access control | **Preserve safe current deployment** | No new enterprise roles without a use case. |
| 19. Development/verification | **Keep and strengthen** | Tests, browser verification, test Sheets, performance fixtures. |
| 20. Delivery phases | **Replace MVP sequence** | Follow new focused implementation plan instead of old massive Phase 1. |

**Decision precedence:** focused MVP PRD → UX specification → MVP implementation plan, subject to safety and data integrity. Unresolved breaking requirements should be raised for approval, not silently imported from the old source.
