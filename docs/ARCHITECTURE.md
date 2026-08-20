# ApcoTask — Architecture

## Current Target

Current architecture supports **Phase 1 — Absolute MVP** only.

The goal is to keep the application simple, testable, and easy to extend later without designing Phase 2 or Phase 3 in advance.

## Stack

* React
* TypeScript
* Vite
* Tauri
* Rust
* SQLite
* Vitest

Target platform: **Windows 10 22H2**.

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
* widget interface;
* user input;
* rendering application state.

React components should not contain core task-selection logic or raw persistence logic.

### Domain

TypeScript domain code contains:

* `Category` and `Task` models;
* task-selection logic;
* `Done` behavior;
* temporary `Next` behavior;
* ordering rules.

Domain logic should remain independent from React, SQLite, and Tauri wherever practical.

Task selection should be implemented as deterministic, testable TypeScript logic.

### Persistence

SQLite stores canonical application data.

Persistence should be accessed through a small repository/service boundary rather than directly throughout React components.

Persist:

* categories;
* tasks;
* task completion state;
* category order;
* task order;
* widget settings.

Temporary `Next` state is separate from canonical task state.

### Tauri / Rust

Use Tauri and Rust only where native desktop integration is required.

Examples:

* application windows;
* widget window behavior;
* Floating/Desktop modes;
* Windows startup integration;
* native SQLite integration if required.

Do not move ordinary task-management business logic into Rust without a concrete reason.

## Windows

ApcoTask uses:

```text
Main Window
└── backlog management

Widget Window
└── current task execution
```

The widget must support:

* Floating mode;
* Desktop mode;
* moving;
* resizing;
* persisted position and size.

Window-specific code should remain separate from task-selection logic.

## State

Distinguish between:

### Canonical State

Persistent product data:

* categories;
* tasks;
* ordering;
* completion status;
* widget settings.

### Execution State

Temporary runtime state such as:

* current queue position;
* temporarily skipped tasks.

Temporary execution state must not mutate persistent task priority or status unless explicitly required.

## Testing

Prioritize automated tests for domain behavior.

At minimum, task-selection tests should cover:

* multiple categories;
* one category;
* unequal category sizes;
* empty categories;
* completed tasks;
* no active tasks.

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
