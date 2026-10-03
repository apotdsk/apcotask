# ApcoTask — Plan

## How to Use This File

- One task per session. A task is finished only when its "Done when" criteria are met and the validation checks pass.
- Status: `[ ]` to do · `[~]` in progress · `[x]` done · `[!]` blocked (reason in one line).
- The agent updates statuses at session end. Adding, removing, splitting, or reordering tasks requires approval from the project owner.
- Each task lists its scope, what it depends on, and how it is verified. Behavior is defined in `docs/PRODUCT.md`; this file only says what to build in which order.
- Move finished milestones to "Completed" with one line per task.

## Current Milestone: A — Persistence

### T01 — Persistence contract tests
Status: [x]
Depends on: committed docs
Scope: stub repository module with the full API and `PersistenceError`; contract tests for every persistence invariant, ordering rule, and the completed-task lifecycle in `docs/PRODUCT.md`. No implementation.
Done when: every test fails at its own assertion with "not implemented"; typecheck passes; tests reviewed and approved by the project owner and committed separately.

### T02 — Schema, migrations, test driver, categories
Status: [x]
Depends on: T01
Scope: choose the Node test driver (resolve the open decision); first migration with all tables; driver interface; test adapter; category repository functions; error mapping for category errors; schema-constraint mapping tests for `DUPLICATE_ORDER` and `INVALID_STATUS`.
Done when: all category tests pass; ARCHITECTURE.md and DECISIONS.md updated for the driver choice.

### T03 — Task repository
Status: [x]
Depends on: T02
Scope: task create, get, list, update, complete, reactivate, delete, move, reorder; `purgeExpiredCompletedTasks(now)`.
Done when: all persistence contract tests pass.

### T04a — Batch driver and repository refactor
Status: [ ]
Depends on: T03
Scope: replace `transaction(callback)` with guarded `batch(statements)` in the driver contract; update the Node SQLite adapter; refactor repository atomic operations to use read, guarded batch, two-phase temporary positions, and stale-read retry. No Tauri changes.
Done when: all existing persistence contract tests pass unchanged; focused batch tests prove commit, SQL-error rollback, affected-row rollback, three-attempt stale-read retry ending in `CONFLICT`, and two-phase gap closing; typecheck and lint pass.

### T04b — Production Rust database adapter
Status: [ ]
Depends on: T04a
Scope: app-owned `rusqlite` connection using the `bundled` feature in the app data directory; startup migrations with version tracking; foreign keys and WAL enabled and verified; asynchronous Tauri `select`, `execute`, and `batch` commands with database work dispatched through `spawn_blocking`; TypeScript production adapter.
Done when: Rust tests and project validation pass; manual smoke check passes: create a category and a task, restart, data is present; deleting a non-empty category fails.

## Milestone B — Execution Logic

### T05 — Execution session
Status: [ ]
Depends on: none (pure domain)
Scope: current task, `Next` with wrap-around, `Done` continuing with the following task, recomputation after backlog changes, empty state. Tests first.
Done when: all execution tests listed in ARCHITECTURE.md (Testing) pass.

## Milestone C — Application Shell and Main Window

### T06 — Design document
Status: [ ]
Depends on: none
Scope: `docs/DESIGN.md` with main window layout, widget appearance, and basic visual rules. Written or approved by the project owner.
Done when: committed.

### T07 — Application shell
Status: [ ]
Depends on: T04b
Scope: main and widget windows, tray with Open backlog and Quit, hide-on-close, `backlog-changed` event wrappers in `src/native/`.
Done when: manual check of tray, hide-on-close, and Quit; both windows open.

### T08 — Backlog: categories
Status: [ ]
Depends on: T06, T07
Scope: list, create, rename, delete (with error message when it fails), reorder.
Done when: manual check; changes visible after restart.

### T09 — Backlog: tasks
Status: [ ]
Depends on: T08
Scope: create, edit, delete, move, reorder; completed tasks shown and reactivatable; cleanup run at start and hourly.
Done when: manual check, including a completed task disappearing after purge (tested with an injected time in the domain or repository, not by waiting).

### T10 — Settings
Status: [ ]
Depends on: T07
Scope: widget mode setting; start with Windows via `@tauri-apps/plugin-autostart`; `--autostart` starts with the main window hidden.
Done when: manual check after a Windows restart with autostart on and off.

## Milestone D — Widget

### T11 — Widget content
Status: [ ]
Depends on: T05, T07
Scope: show current task, `Done`, `Next`, empty state; react to `backlog-changed`.
Done when: manual check that edits in the main window update the widget immediately.

### T12 — Widget modes
Status: [ ]
Depends on: T10, T11
Scope: short spike on Desktop mode on Windows (resolve the open decision), then Floating and Desktop modes.
Done when: both modes work on Windows 10 22H2; DECISIONS.md updated.

### T13 — Widget geometry
Status: [ ]
Depends on: T11
Scope: persisted position and size; off-screen fallback to the primary monitor; resolve the window-state open decision.
Done when: manual check including a disconnected or changed monitor setup.

## Milestone E — Phase 1 Acceptance

### T14 — Acceptance pass
Status: [ ]
Depends on: all tasks above
Scope: walk through every behavior in `docs/PRODUCT.md` in the running app; list defects as new tasks.
Done when: no open defects against PRODUCT.md.

## Completed

- Task-selection domain logic (`src/domain/taskSequence`) with tests.
- Product, architecture, and decision documents revised (2026-10-01).
