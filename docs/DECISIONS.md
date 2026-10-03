# ApcoTask — Decisions

Short record of non-obvious decisions and their reasons. Newest entries at the bottom. Entries are not edited after the fact; a reversed decision gets a new entry that references the old one.

## D-001 · 2026-10-01 · SQLite through the Tauri SQL plugin

Context: No SQLite integration existed. Options were the Tauri SQL plugin, custom Rust persistence, WASM SQLite in the webview, or different drivers for tests and production.
Decision: Production uses `@tauri-apps/plugin-sql`. Repository code depends on a minimal driver interface; tests use a Node SQLite driver with an in-memory database.
Consequences: Domain and repository logic stay in TypeScript with little Rust. Tests verify repository behavior and SQLite constraints, but not plugin wiring, permissions, database path, or plugin connection pragmas; those need a manual smoke check.

## D-002 · 2026-10-01 · Column `position` instead of `order`

Context: `ORDER` is an SQL keyword and would need quoting in every query.
Decision: The domain field `order` is stored in the column `position`.
Consequences: The repository maps between the two names.

## D-003 · 2026-10-01 · Ordering semantics

Context: Unique order constraints make swapping two items fail midway. Product docs did not define reordering.
Decision: Items are appended on create. Reordering submits the complete order of one list in one atomic operation. Moving appends to the target category. Positions are contiguous from 0. Regular edits cannot change order or membership.
Consequences: One validation point per reorder, no partial states, and the swap problem stays inside the implementation (temporary negative positions within a transaction).

## D-004 · 2026-10-01 · Own error codes

Context: The production plugin and the test driver produce different error messages.
Decision: The repository throws `PersistenceError` with fixed codes, mapped from driver errors in one place.
Consequences: Tests are driver-independent. The mapping must be updated if a driver changes its messages.

## D-005 · 2026-10-01 · Shared SQL migration files

Context: Plugin migrations are registered in Rust; tests run in Node.
Decision: Migrations are SQL files in `src-tauri/migrations/`, embedded into the app and read by the tests.
Consequences: One schema definition for production and tests.

## D-006 · 2026-10-01 · Window and state ownership

Context: The main window and the widget are separate webviews with separate runtimes and connections.
Decision: SQLite is the only source of truth. Execution state belongs to the widget. Writers emit `backlog-changed`; other windows reload. WAL mode is enabled.
Consequences: No shared in-memory state to keep in sync. Every canonical write must emit the event.

## D-007 · 2026-10-01 · Execution state is not persisted

Context: Product requires restart from the first task.
Decision: The current position lives only in the widget's memory. `Next` wraps around after the last task.
Consequences: No execution-state storage or migration. Restarting resets the sequence.

## D-008 · 2026-10-01 · Completed tasks are deleted after 24 hours

Context: The product requires completed tasks to stay visible for one more day. Keeping hidden completed tasks would make them block category deletion invisibly and break whole-list reordering from the UI.
Decision: Completed tasks are permanently deleted 24 hours after completion by `purgeExpiredCompletedTasks(now)`, run by the main window at start and hourly. `completed_at` is required exactly when status is `completed`.
Consequences: No hidden data. Completion is reversible only within 24 hours.

## D-009 · 2026-10-01 · Tray lifecycle and autostart

Context: The widget must keep running when the main window is closed. Start with Windows is a Phase 1 setting.
Decision: A Rust-created tray icon offers Open backlog and Quit. Closing the main window hides it. Autostart uses `@tauri-apps/plugin-autostart` with the OS registration as source of truth and a `--autostart` argument that keeps the main window hidden.
Consequences: Autostart state is never stored in SQLite, so it cannot drift from the real OS setting.

## D-010 · 2026-10-01 · Category names are not unique

Context: The product owner has no preference.
Decision: Names must be non-empty but may repeat.
Consequences: No uniqueness constraint or error code for names.

## D-011 · 2026-10-03 · Built-in Node SQLite test driver

Context: Persistence contract tests need an in-memory SQLite database that applies the production SQL migrations. The project targets Windows and currently uses Node 22.13. `better-sqlite3` would add a native development dependency and potential Windows build-tool requirements, while Node 22.13 already provides `node:sqlite`.
Decision: Tests use the built-in `node:sqlite` module, with Node 22.13 as the minimum development runtime. The adapter remains test-only and implements the same asynchronous driver interface used by production persistence.
Consequences: No SQLite npm dependency is required. Test TypeScript uses a separate Node-aware project, while application TypeScript and the production bundle exclude the adapter. The Node 22 API is experimental, so future Node upgrades may require adapter-only changes.

## Open Decisions

- Widget position and size storage: `tauri-plugin-window-state` or the `settings` table. Decide in the widget task.
- Technical approach for Desktop mode on Windows. Decide in the widget task after a short spike.
