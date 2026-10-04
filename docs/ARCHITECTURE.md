# ApcoTask — Architecture

## Current Target

Current architecture supports **Phase 1 — Flashcard MVP** only.

The goal is to keep the application simple, testable, and easy to extend later without designing Phase 2 or Phase 3 in advance.

Product behavior is defined in `docs/PRODUCT.md`. This document describes how the system implements it. Reasons for decisions are recorded in `docs/DECISIONS.md`.

## Stack

* React
* TypeScript
* Vite
* Tauri 2
* Rust
* SQLite via `rusqlite` with the `bundled` feature
* `@tauri-apps/plugin-autostart` (start with Windows)
* Vitest

Target platform: **Windows 10 22H2**.

## Project Structure

```text
src/domain/            models, task selection, ordering rules, execution logic (pure TypeScript)
src/persistence/       repository API, driver interface, driver adapters, error mapping
src/native/            TypeScript wrappers around Tauri APIs (windows, events, tray actions, autostart, window state)
src/ui/                React UI; main/ (backlog, settings) and widget/ to be created when implemented
src-tauri/             Tauri configuration, Rust setup, plugins, windows, tray
src-tauri/migrations/  versioned SQL migrations, shared by the app and the tests
```

## Architecture

Use three conceptual layers:

```text
UI
↓
Domain / Application Logic
↓
Persistence & Native Integration
```

### UI

React is responsible for:

* main backlog interface;
* settings interface in the main window;
* widget interface;
* user input;
* rendering application state.

React components should not contain core task-selection logic, raw persistence logic, or direct Tauri API calls. Tauri APIs are accessed through `src/native/`.

### Styling

- SCSS modules (`sass` as a dev dependency). Global styles in `src/App.scss`; shared partials in `src/styles/_vars.scss` and `src/styles/_mixins.scss`.
- Every module starts with `@use '@/styles/vars' as vars;` and `@use '@/styles/mixins' as mx;` (Vite alias `@` → `src`).
- Explicit class names instead of structural pseudo-selectors such as `:first-child`. Interaction states (`:hover`, `:focus-visible`, `:disabled`) are allowed and required by DESIGN.md.
- Relative units (rem, em, %); px only for borders.
- Design tokens from `docs/DESIGN.md` live in `_vars.scss`.

### Fonts and Remote Content

- Agdasima, Oswald, and Inter are bundled as local font files in `src/assets/fonts/` and loaded with `@font-face`. No font or other resource is loaded from the internet.
- The Tauri content security policy allows only local resources, which enforces the no-remote-content rule technically.

### Domain

TypeScript domain code contains:

* `Category` and `Task` models;
* task-selection logic;
* `Done` behavior;
* temporary `Next` behavior;
* sequence recomputation after backlog changes;
* ordering rules;
* input validation (non-empty names and titles).

Domain logic should remain independent from React, SQLite, and Tauri wherever practical.

Task selection and execution behavior should be implemented as deterministic, testable TypeScript logic. Functions that depend on the current time receive it as a parameter.

### Persistence

SQLite stores canonical application data. What is persisted is defined in `docs/PRODUCT.md` (Persistence).

Persistence is accessed only through the repository API in `src/persistence/`, never directly from React components.

#### Repository API Semantics

- `getCategory` and `getTask` return `undefined` when the requested ID does not exist.
- `listTasks` throws `CATEGORY_NOT_FOUND` when its category does not exist.
- Creating or updating a task normalizes an omitted, empty, or whitespace-only description to no description.
- `updateTask` replaces both title and description. Omitting the description clears it.
- Moving a task to its current category throws `INVALID_INPUT`.
- Completing an already completed task or reactivating an active task throws `INVALID_STATUS`.

#### Integration

- Production: a small Tauri Rust database module owns one `rusqlite::Connection` in application state behind a mutex. The database is opened from the app data directory during startup.
- The Rust module exposes three generic commands: `select`, `execute`, and `batch`. Database work runs off the main thread through async Tauri commands using `spawn_blocking`.
- The generic SQL commands are acceptable only because the application never loads remote content. Application windows must not load external URLs.
- Repository functions depend on a minimal asynchronous driver interface (`select`, `execute`, `batch`).
- A batch is a list of write statements executed in one native SQLite transaction. Statements may require an exact affected-row count. Any SQL failure or affected-row mismatch rolls back the complete batch.
- Repository operations that calculate writes from prior reads use guarded statements and retry after an affected-row mismatch. After three failed attempts, the repository throws `PersistenceError` with code `CONFLICT`.
- Adapters:
  - production: Tauri command adapter for the Rust database module;
  - tests: the built-in `node:sqlite` driver with an in-memory database.
- The test adapter is isolated in `src/persistence/testing/`, is not exported from the persistence entry point, and is excluded from the application TypeScript project.
- Development and tests require Node.js 22.13 or newer. The synchronous `node:sqlite` API is contained inside the test adapter behind the asynchronous driver interface.
- The driver interface exists for testability, not for supporting future backends.

#### Schema

```text
categories
  id        TEXT PRIMARY KEY
  name      TEXT NOT NULL CHECK (length(trim(name)) > 0)
  position  INTEGER NOT NULL UNIQUE

tasks
  id            TEXT PRIMARY KEY
  category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0)
  description   TEXT NULL
  position      INTEGER NOT NULL
  status        TEXT NOT NULL CHECK (status IN ('active', 'completed'))
  completed_at  TEXT NULL
  UNIQUE (category_id, position)
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))

settings
  key    TEXT PRIMARY KEY
  value  TEXT NOT NULL
```

- The domain field `order` maps to the column `position`, because `ORDER` is an SQL keyword.
- IDs are generated in TypeScript with `crypto.randomUUID()`.
- Timestamps are stored as ISO 8601 strings in UTC.
- Foreign-key enforcement is enabled and verified on the app-owned connection at startup.
- WAL mode is enabled and verified on the app-owned connection at startup.
- Both windows access the same Rust-managed connection through Tauri commands. They do not open per-window database connections.

#### Migrations

- Migrations are versioned SQL files in `src-tauri/migrations/`, applied in order.
- The Rust database module embeds them at build time and applies pending migrations at startup. `PRAGMA user_version` tracks the applied version.
- Each migration and its version update run in the same transaction.
- Applied migration files are immutable. Startup fails if the database version is newer than the application supports.
- Tests apply the same files to the in-memory test database, so tests and production share one schema definition.

#### Ordering Operations

- Create appends at the end of the list (`max(position) + 1`, or 0 for an empty list).
- Reorder and move run in one transaction. To avoid transient unique-constraint conflicts, positions are first set to temporary negative values, then to their final values.
- Delete and move close the gap in the affected list within the same transaction. All gap closing uses the same two-phase temporary-negative-position technique as reorder; positions are never shifted directly in one statement.

#### Completed Task Cleanup

- The repository provides `purgeExpiredCompletedTasks(now)`. It deletes tasks completed 24 hours or more before `now` and closes the resulting gaps, in one transaction.
- The main window runs it at application start and once per hour. It keeps running while the main window is hidden.
- If any task was deleted, the main window emits `backlog-changed`.

#### Errors

The repository throws `PersistenceError` with one of these codes:

```text
DUPLICATE_ORDER
CATEGORY_NOT_FOUND
CATEGORY_HAS_TASKS
INVALID_STATUS
INVALID_INPUT
INVALID_REORDER
NOT_FOUND
CONFLICT
```

Driver errors are mapped to these codes in one place inside `src/persistence/`. Tests assert codes, never driver messages.
Constraint mapping uses named SQL constraints and portable SQLite message text rather than driver-specific error fields, so the same mapping can be used by the Node test driver and the Tauri SQL plugin.

### Tauri / Rust

Use Tauri and Rust only where native desktop integration is required.

Examples:

* application windows;
* widget window behavior;
* Floating/Desktop modes;
* system tray;
* start with Windows;
* database connection ownership, migrations, and generic SQL command execution.

Do not move ordinary task-management business logic into Rust. Rust owns connection lifecycle and transaction execution; repository rules remain in TypeScript.

## Windows

ApcoTask uses:

```text
Main Window
├── backlog management
└── settings

Widget Window
└── current task execution
```

Window-specific code should remain separate from task-selection logic.

### Window and State Ownership

Each window is a separate webview with its own JavaScript runtime. Both use the same app-owned Rust database connection through Tauri commands.

- SQLite is the single source of truth for canonical state. No window holds an authoritative in-memory copy.
- Execution state is owned by the widget window only.
- After any canonical write, the writing window emits the Tauri event `backlog-changed`. Other windows reload the affected data through the repository.
- On `backlog-changed`, the widget recomputes the sequence according to `docs/PRODUCT.md` (Execution Session).
- A widget mode change in the settings is sent to the widget window as the Tauri event `widget-mode-changed`.

### Application Lifecycle

- The single-instance plugin is registered first. A second launch exits before initializing another database connection and asks the running process to open the backlog.
- The system tray is created in Rust and offers **Open backlog** and **Quit**.
- Closing the main window hides it; the application exits only through **Quit**.
- Closing the widget is prevented so it cannot become hidden without a defined restore action.
- Rust uses one `open_backlog` operation for the tray and second-instance callback: show the existing main window, restore it if minimized, and focus it.
- Start with Windows uses `@tauri-apps/plugin-autostart`. The operating-system registration is the source of truth; the setting is read from the plugin, not stored in SQLite.
- Autostart launches the application with the `--autostart` argument. With that argument, the main window starts hidden.

### Widget Settings

- Widget mode is stored in the `settings` table.
- Widget position and size: use `tauri-plugin-window-state` if it satisfies the product requirements, including the off-screen fallback; otherwise store them in the `settings` table. Decided in the widget task.

## State

Distinguish between:

### Canonical State

Persistent product data, as listed in `docs/PRODUCT.md` (Persistence).

### Execution State

Temporary runtime state, not persisted:

* the current task ID;
* the information needed to determine the following task after the current task is completed or deleted.

Skipping is represented by advancing the current position; there is no separate list of skipped tasks.

Temporary execution state must not mutate persistent task priority or status unless explicitly required.

## Testing

### Domain

Task-selection tests should cover at minimum:

* multiple categories;
* one category;
* unequal category sizes;
* empty categories;
* completed tasks;
* no active tasks.

Execution tests should cover:

* `Next` advancing and wrapping around;
* `Next` with one active task;
* `Done` continuing with the following task;
* recomputation when the current task stays active, is completed, or is deleted;
* the empty state.

### Persistence

- Contract tests in `src/persistence/` run against the Node SQLite driver with an in-memory database and the shared migrations.
- Every persistence invariant in `docs/PRODUCT.md` has at least one test.
- Rejection tests assert a specific `PersistenceError` code.
- Cleanup tests pass an explicit `now`; they never depend on the real clock.

Not covered by automated tests:

* Tauri command wiring and production IPC serialization;
* packaged application database path and filesystem permissions;
* both windows reaching the same managed database state;
* production restart persistence;
* event delivery between windows;
* tray, autostart registration, and window modes.

These are verified by a manual smoke check in the running application after changes to persistence, windows, or native integration.

### UI and Native

UI and native integration tests may be added where they provide meaningful value.

## Dependency Rules

* Keep dependencies minimal.
* Prefer platform or existing stack capabilities before adding libraries.
* Do not introduce infrastructure for future cloud synchronization.
* Do not introduce state-management frameworks unless application complexity demonstrates a need.
* Do not introduce abstractions solely for hypothetical future features.

## Future Phases

Phase 2 may replace or extend the task-selection implementation.

Phase 3 may introduce cloud synchronization and Android.

The Phase 1 architecture should avoid unnecessary coupling that would make those changes difficult, but should not implement them in advance.
