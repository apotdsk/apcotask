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

## D-012 · 2026-10-03 · App-owned rusqlite connection and guarded batches

Context: D-001 selected `@tauri-apps/plugin-sql` for production persistence. The repository contract requires multi-statement atomic operations, but the plugin does not expose a JavaScript transaction API that guarantees `BEGIN`, the operation statements, and `COMMIT` use the same pooled connection. Issuing those calls separately therefore cannot guarantee rollback. The main and widget webviews can also initiate operations between a repository read and a later write.
Decision: D-001 is superseded for production database access. The Tauri application owns one `rusqlite::Connection`, built with the `bundled` feature, in managed state behind a mutex and opened in the app data directory at startup. Rust exposes generic `select`, `execute`, and `batch` commands; database work runs off the main thread through async Tauri commands using `spawn_blocking`. A batch runs all statements in one native SQLite transaction and may enforce expected affected-row counts. Repository operations remain in TypeScript; operations based on prior reads use guarded batch statements and retry when a guard reports a stale read. After three failed attempts, they throw `PersistenceError` with code `CONFLICT`. All gap closing uses two-phase temporary positions. The Node test adapter implements the same driver interface. Migrations remain shared SQL files and production tracks their versions with `PRAGMA user_version`. Generic SQL commands are acceptable only because the application never loads remote content; application windows must not load external URLs.
Consequences: Production transactions have explicit same-connection atomicity, and both windows share one connection. Repository behavior remains covered by the existing TypeScript contract suite. The project now owns connection setup, migration execution, IPC value conversion, and structured database errors. Foreign keys and WAL are enabled and verified at startup. Real IPC, app-data path behavior, shared access from both windows, and restart persistence still require native tests or a manual smoke check.

## D-013 · 2026-10-04 · Single-instance and window lifecycle

Context: Multiple application processes would each open the same database, closing the borderless widget would leave no defined way to restore it, and the tray behavior for a hidden, minimized, or visible main window was not defined.
Decision: ApcoTask permits one process. A second launch asks the existing process to show, restore, and focus the main window, then exits before initializing another database connection. The same show-restore-focus operation implements **Open backlog**. Main-window close requests hide it. Widget close requests, including `Alt+F4`, are ignored. **Quit** is the only application-exit action.
Consequences: One Rust-managed database connection serves both webviews, repeated launches are useful, tray behavior is idempotent, and the widget cannot be accidentally hidden without a recovery path.

## Open Decisions

- Widget position and size storage: `tauri-plugin-window-state` or the `settings` table. Decide in the widget task.
- Technical approach for Desktop mode on Windows. Decide in the widget task after a short spike.
