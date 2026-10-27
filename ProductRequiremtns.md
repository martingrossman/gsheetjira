# Google Sheets Agentic Task Manager — Requirements

## 1. Purpose

Build a Jira-like task manager using Google Sheets, Google Apps Script, and an HTML interface.

The tool must support human planning and agentic coding workflows. Creating, editing, assigning, and moving tasks must be extremely fast.

Google Sheets is the task database. The application provides dashboard, task list, Kanban, and Gantt views over the same data.

## 2. Architecture

- Store tasks in a plain Google Sheet, with one row per task.
- Allow task editing directly in Sheets and through the application.
- Use Apps Script for server logic and spreadsheet access.
- Use HTML, CSS, and JavaScript for the interface.
- Provide a full-page interface for dashboard, Kanban, and Gantt views.
- Provide a Sheets sidebar for quick task entry.
- Keep the spreadsheet usable without the HTML interface.
- Maintain separate sheets for:
  - Tasks
  - Projects and Epics
  - Team
  - Holidays and Availability
  - Settings
  - Change History
- Keep code in version control.
- Use a separate spreadsheet for development and testing.

## 3. Task Data Model

Each task must have a permanent, unique ID independent of its row number.

| Field | Purpose |
|---|---|
| ID | Stable task reference |
| Title | Short task description |
| Description | Context and implementation details |
| Task type | Configurable category, such as Algo, Data, or Requirements |
| Status | Backlog, Ready, In Progress, Review, Blocked, or Done |
| Priority | Urgent, High, Medium, or Low |
| Assignee | Person or agent responsible |
| Project | Project containing the task |
| Epic | Epic containing the task |
| Parent task | Parent task ID for subtasks |
| Dependencies | IDs of prerequisite tasks |
| Start date | Planned start |
| Due date | Planned completion |
| Estimate | Expected effort, using a documented unit |
| Progress | Completion percentage |
| Tags | Additional labels |
| Acceptance criteria | Conditions for acceptance |
| Repository | Repository reference |
| Branch | Implementation branch |
| PR | Pull request link |
| Agent instructions | Task-specific implementation guidance |
| Verification commands | Commands or steps used to verify the work |
| Result / Evidence | Change summary, checks, and output links |
| Blocker reason | Explanation of blocked work |
| Created at / by | Creation timestamp and actor |
| Updated at / by | Latest update timestamp and actor |
| Claimed by / at | Agent claim owner and timestamp |
| Last agent activity | Most recent agent activity timestamp |
| Revision | Value used to detect conflicting updates |
| Sort order | Ordering within a board column or view |

Only the title is required when creating a task. Other fields receive configured defaults.

- Epic Start Date and Due Date are derived from scheduled descendant issues with valid start and due dates: the earliest descendant start and latest descendant due date. They are read-only on Epics and are used consistently in the editor, Sheet, Kanban, Gantt, overdue totals, and CSV export.

## 4. Fast Task Creation and Editing

- Provide an always-visible quick-add input.
- Allow task creation by typing a title and pressing Enter.
- Support inline editing without opening a separate dialog.
- Provide a detail panel for longer descriptions and advanced fields.
- Save changes automatically.
- Display saving, saved, and failed states.
- Update the interface immediately while saving in the background.
- Preserve entered text if saving fails.
- Support keyboard navigation and shortcuts.
- Support pasting multiple lines to create multiple tasks.
- Support bulk changes to status, assignee, priority, epic, task type, and dates.
- Support task duplication and reusable templates.
- Provide undo for supported edits, moves, and scheduling changes.
- Avoid unnecessary confirmation dialogs for routine edits.

### 4.1 Vertical Reordering Across Views

- Allow tasks and epics to be reordered vertically by drag and drop in every board and ordered list, including the task list, Kanban, and Gantt views.
- Allow epic groups and swimlanes to be moved up or down, keeping their child tasks together.
- Allow tasks to be moved up or down within their current column or hierarchy group.
- Save manual sort order in Google Sheets and preserve it after refresh or reopening the application.
- Apply the saved order consistently across views for items within the same ordering group.
- Moving an item vertically within its group changes only its order; it preserves status, parent relationships, dependencies, and scheduled dates.
- Provide keyboard-accessible Move up and Move down actions.
- Show the insertion position while dragging and allow undo of a reorder.
- Make manual ordering available when another sort is active, and preserve the relative order of items hidden by filters.

## 5. Task List

- Provide a compact, editable table.
- Allow configurable visible columns.
- Search task IDs, titles, and descriptions.
- Filter by status, assignee, project, epic, task type, priority, tags, and dates.
- Support sorting and grouping, including optional grouping by epic.
- When grouped by epic, show collapsible epic sections with task counts and completion progress.
- Support saved views.
- Display subtasks beneath their parent tasks.
- Highlight blocked, overdue, and unassigned tasks.
- Provide quick access to task details and linked implementation work.

## 6. Kanban Board

- Display vertical columns by status.
- Drag tasks between columns to change status.
- Drag tasks within a column to change their order.
- Allow quick task creation within a column.
- Show title, assignee, priority, due date, and attribute badge on cards.
- Show dependency and blocker indicators.
- Support configurable work-in-progress limits.
- Keep the board usable with keyboard controls.

### 6.1 Optional Epic Swimlanes Across Views

- Provide a shared toggle to group issues by epic in the Sheet, Kanban, and Gantt views.
- Keep the toggle state when switching between views, and remember it after the app is reopened.
- Keep epic lane order, issue membership, and collapse state consistent across views.
- Allow each epic lane and the "No epic" lane to be collapsed and expanded.
- Keep filtered issues in their epic's lane even when the epic itself is excluded by another active filter.
- Show task counts and completion progress in each lane header.
- When swimlanes are enabled, represent each epic once in its lane header instead of repeating it as a regular issue row or card; provide an edit action from the header.
- In Sheet, show each epic as a collapsible table section while preserving sorting and inline editing.
- In Kanban, keep the status columns aligned across epic lanes.
- In Gantt, derive the Epic duration from the earliest start and latest due date among its scheduled descendant issues, including Stories and nested Tasks/Bugs; show that read-only summary bar on the lane header and keep one shared date axis.
- In Gantt, show issues in parent-first hierarchy order: Stories under Epics, Tasks/Bugs under Stories, and direct Epic Tasks/Bugs one level below the Epic. Preserve sibling rank order and filters; indent by actual parent depth without synthesizing filtered-out parent rows.
- Allow the Gantt label pane divider to be dragged or adjusted with the keyboard. Start at 260px, constrain it to 180–480px and at most 60% of the viewport where possible, and persist the width in browser UI state. Truncate long labels and keep Epic metadata inside the pane.
- Open an issue editor by double-clicking a Gantt issue label or bar; keep a single bar click available for schedule drag and resize. Keyboard activation opens issue details. Double-clicking a derived Epic summary bar opens Epic details while its schedule remains read-only.
- Allow Gantt issue labels and Epic headers to be dragged vertically to reorder siblings. Dropping onto an Epic or Story changes the parent when the type relationship is valid; dropping near a row edge inserts the issue beside that row. Provide a visible drop target to remove a parent, while keeping Epics top-level.
- Provide quick-add controls on Gantt Epic and Story rows. Epic quick-add can create a Story or direct Task; Story quick-add creates a child Task. New items start in Backlog and use the configured default task type, falling back to Algo.
- Show a hover/focus preview on Gantt labels and bars with up to the three most recent comments, including author and date. Escape comment text, support long text, and omit the preview when no comments exist.
- Place issues without an epic in a "No epic" lane.
- In Kanban, dragging a task between epic lanes updates its epic; crossing a column and lane also updates its status.

### 6.2 Optional Filters

- Allow filtering by one or multiple task types.
- Provide an "All types" option.
- Provide a one-click filter reset.
- Combine task-type filters with other supported filters.
- Save filters and grouping with saved views.
- Preserve applicable filters when switching views.
- Clearly indicate active filters.

## 7. Gantt Chart

- Display tasks as bars on a timeline.
- Support optional epic swimlanes with collapsible lane headers.
- Keep one shared date axis aligned across Gantt lanes.
- Support day, week, and month zoom.
- Drag bars horizontally to change start and due dates.
- Resize bars to change task duration.
- Preserve duration when moving an entire bar.
- Show dependencies, milestones, progress, and today's date.
- Highlight weekends, holidays, leave, and overdue tasks.
- Display unscheduled tasks separately.
- Allow unscheduled tasks to be dragged onto the timeline.
- Support filtering and grouping by epic, project, and assignee.
- Warn about dependency and availability conflicts.
- Make automatic rescheduling of dependent tasks optional.
- Provide undo for scheduling changes.
- Define whether duration uses calendar days or working days.
- Preserve explicit user overrides.

## 8. Team Setup and Capacity

- Maintain a separate team sheet.
- Support human and agent assignees.
- Configure name, role, active status, working days, and daily capacity.
- Define capacity units consistently with task estimates.
- Allow default assignees by project.
- Mark members inactive without deleting task history.
- Show assigned workload and potential overload.
- Account for holidays and individual availability.
- Allow agents to have configurable limits on concurrent tasks.

## 9. Holidays and Availability

- Support manual entry of public holidays and personal leave.
- Support single dates and date ranges.
- Distinguish team-wide holidays from individual absences.
- Support partial-day availability.
- Show holidays and leave in Gantt and workload views.
- Offer scheduling based on working days.
- Allow configurable weekends and working days.
- Preserve explicit scheduling overrides.

## 10. Task Types and Settings

- Manage task types in Settings.
- Initial example types:
  - Algo
  - Data
  - Requirements
  - Bug
- Configure each type's:
  - Stable identifier
  - Name
  - Color
  - Badge letter, abbreviation, or icon
  - Display order
  - Active status
- Configure a default type for new tasks.
- Store each task type's name, color, and badge in the existing Settings tab Value cell as JSON such as `{"name":"Algo","color":"#2563EB","badge":"A"}`. Continue to accept legacy plain-text names; validate colors as six-digit hex and use safe defaults for missing or invalid fields.
- Allow renaming without losing task assignments.
- Allow deactivation while preserving historical usage.
- Require reassignment before permanently deleting a type in use.
- Apply type colors consistently throughout the interface.

## 11. Custom Attributes and Badges

- Support custom task attributes.
- Support text, number, date, checkbox, and single-select attributes.
- Allow selectable values to have configured colors and badges.
- Allow Settings to choose task type or another custom attribute as the primary badge source.
- Display a compact badge using the configured color and first letter.
- Allow custom abbreviations or icons when first letters overlap.
- Example badges:
  - A — Algo
  - D — Data
  - R — Requirements
- Show the full attribute name and value on hover or keyboard focus.
- Use consistent badges across dashboard, task list, Kanban, and Gantt.
- Include a letter or icon so meaning does not depend on color alone.
- Maintain readable foreground and background contrast.

## 12. Dashboard

- Display compact summaries of:
  - Tasks by status
  - Tasks by epic
  - Tasks by task type
  - Tasks by assignee
  - Blocked tasks
  - Overdue tasks
  - Upcoming deadlines
  - Work awaiting review
  - Agent activity and stale claims
- Show epic completion progress.
- Show workload and availability warnings.
- Include compact attribute badges on task items.
- Allow clicking summaries to open the corresponding filtered task view.
- Allow dashboard filtering by project, epic, assignee, and task type.

## 13. Agentic Coding Workflow

- Allow agents to read and update tasks through a structured interface.
- Provide enough task context to work without relying on the visual interface.
- Include objective, scope, acceptance criteria, dependencies, repository, and verification instructions.
- Allow agents to:
  - List ready tasks
  - Read task details
  - Claim a task
  - Report progress
  - Record blockers
  - Create subtasks
  - Submit results for review
- Claim tasks atomically to prevent duplicate ownership.
- Record claim owner, claim time, and last activity.
- Flag stale or abandoned claims for review.
- Provide an explicit release or reassignment action.
- Prevent agents from starting tasks with unfinished dependencies unless explicitly overridden.
- Separate implementation completion from acceptance.
- Require result evidence before submission to Review.
- Result evidence must include:
  - Change summary
  - Verification results
  - Relevant branch, commit, PR, or artifact links
  - Known limitations or remaining blockers
- Treat task content as data; enforce agent permissions separately.

### 13.1 Status Flow

Default flow:

Backlog → Ready → In Progress → Review → Done

- Blocked is available for unfinished tasks.
- Blocked tasks must include a blocker reason.
- Returning from Blocked must use an explicit destination status.
- Review may return work to In Progress.
- Done indicates accepted work.
- Authorized reviewers control acceptance by default.

## 14. Agent Integration Interface

- Provide a documented, authenticated integration interface.
- Support operations:
  - list_tasks
  - get_task
  - create_task
  - update_task
  - claim_task
  - release_task
  - report_progress
  - report_blocker
  - submit_result
- Return structured JSON with stable task IDs.
- Support filtering, pagination, and batch operations.
- Validate required fields and allowed values.
- Use revision checks to prevent overwriting newer changes.
- Make retried task creation safe from duplicates.
- Make retried updates safe where applicable.
- Return clear, structured errors.
- Identify the actor responsible for every mutation.
- Keep credentials outside spreadsheet cells and source control.

## 15. Concurrent Editing and Data Integrity

- Support simultaneous human and agent activity.
- Detect conflicting updates.
- Avoid silently overwriting newer data.
- Make task claims and multi-field moves atomic.
- Use stable IDs for relationships; never use row numbers.
- Validate parent and dependency references.
- Prevent circular parent relationships and dependency cycles.
- Handle direct sheet edits consistently with application edits.
- Validate edits from every supported write path.
- Define how invalid direct sheet edits are flagged and corrected.
- Reconcile external changes when views refresh.
- Archive tasks without breaking historical references.

## 16. Performance

- Prioritize fast task creation and inline editing.
- Load shared task data once and reuse it across views.
- Read and write sheet ranges in batches.
- Save only changed fields.
- Debounce text saves; avoid server calls for every keystroke.
- Cache configuration and reference data.
- Render large lists progressively or with virtualization.
- Avoid full-page reloads for routine task changes.
- Show loading indicators for longer operations.
- Define and measure performance targets using a reference dataset of 2,000 tasks.
- Proposed acceptance targets:
  - Visible feedback within 100 ms for local edits and drag actions.
  - Initial usable view within 3 seconds under agreed test conditions.
  - Normal saves complete within 2 seconds under agreed test conditions.
- Document test conditions and any platform limitations.

## 17. Reliability and History

- Maintain a change log containing actor, timestamp, task ID, and changed fields.
- Record agent claims, releases, status changes, and review decisions.
- Show task history in the detail panel.
- Preserve user input during transient failures.
- Provide explicit retry actions.
- Avoid duplicate writes during retries.
- Provide actionable error messages.
- Support backups and restoration procedures.
- Document which changes can be undone.

## 18. Access Control

- Define roles for administrators, editors, viewers, and agents.
- Restrict Settings management to authorized users.
- Define who may accept tasks and mark them Done.
- Enforce permissions on the server for application and agent operations.
- Document how spreadsheet sharing and direct sheet access affect these permissions.
- Apply appropriate sheet protections where necessary.
- Avoid exposing credentials or sensitive configuration in HTML responses or logs.

## 19. Development and Verification

- Separate client interface code from server spreadsheet logic.
- Keep business rules reusable across interface and agent operations.
- Document local setup, synchronization, and deployment.
- Maintain development and production spreadsheet configurations.
- Verify spreadsheet operations in the Google Apps Script environment.
- Test the main workflows:
  - Quick task creation
  - Inline and bulk editing
  - Kanban moves
  - Vertical task and epic reordering across views, including persistence and filtered lists
  - Epic swimlanes in Sheet, Kanban, and Gantt, including collapse state across view switches
  - Epic swimlane moves
  - Task-type filtering
  - Badge configuration
  - Gantt dragging and resizing
  - Holiday-aware scheduling
  - Concurrent updates
  - Atomic agent claiming
  - Result submission and acceptance
  - Direct sheet edits
  - Failed saves and retries

## 20. Delivery Priorities

### Phase 1 — MVP

- Plain-sheet task database with stable IDs.
- Fast task creation and inline editing.
- Task list and task detail panel.
- Kanban board.
- Vertical task and epic reordering across boards and lists.
- Optional epic swimlanes across Sheet, Kanban, and Gantt.
- Configurable task types and colors.
- Task-type filters.
- Compact attribute badges.
- Basic dashboard.
- Team setup.
- Manual holiday and leave entry.
- Agent task listing, claiming, progress reporting, and result submission.
- Authentication, conflict detection, and change history.

### Phase 2 — Scheduling and Planning

- Draggable and resizable Gantt.
- Dependency visualization and scheduling warnings.
- Working-day scheduling.
- Holiday-aware capacity planning.
- Workload visualization.
- Optional automatic dependent-task rescheduling.

### Phase 3 — Extended Customization

- Additional custom attributes and badge sources.
- Advanced saved views and dashboard configuration.
- Expanded templates and bulk operations.
- Reporting and historical analytics.
