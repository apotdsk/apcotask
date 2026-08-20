# ApcoTask

ApcoTask is a Windows-first task manager built around a simple idea: instead of constantly showing the full backlog, it surfaces one actionable task at a time.

The MVP consists of:

* categorized task backlogs;
* ordered categories and tasks;
* deterministic round-robin task selection;
* a desktop widget showing one current task;
* `Done` and temporary `Next` actions;
* Desktop and Floating widget modes;
* local-only persistence.

## Status

Current phase: **Phase 1 — Flashcard MVP**

The project is under active development.

## Tech Stack

* React
* TypeScript
* Vite
* Tauri
* Rust
* SQLite
* Vitest
* ESLint
* Prettier

## Requirements

Development currently targets:

* Windows 10 22H2
* Node.js LTS
* npm
* Rust stable
* Microsoft C++ Build Tools
* Microsoft Edge WebView2 Runtime

## Getting Started

Clone the repository:

```bash
git clone <repository-url>
cd apcotask
```

Install JavaScript dependencies:

```bash
npm install
```

Run the development application:

```bash
npm run tauri dev
```

## Development Commands

```bash
npm run tauri dev
npm run test
npm run lint
npm run typecheck
```

Additional commands may be added as the project evolves.

## Project Structure

```text
apcotask/
├── src/                 # React application
├── src-tauri/           # Tauri / Rust native layer
├── docs/
│   ├── PRODUCT.md       # Agent-facing product specification
│   ├── ARCHITECTURE.md  # Architecture and technical decisions
│   └── DESIGN.md        # UI/design specification
├── tests/
├── AGENTS.md            # Codex development instructions
└── README.md
```

## Product Documentation

The implementation-facing product specification is located in:

`docs/PRODUCT.md`

Architecture decisions are documented in:

`docs/ARCHITECTURE.md`

UI and visual design rules are documented in:

`docs/DESIGN.md`

## Development Principles

* Keep the MVP simple.
* Prefer deterministic and testable behavior.
* Keep business logic independent from React and Tauri where possible.
* Keep persistence separate from domain logic.
* Avoid premature abstractions and unnecessary dependencies.
* Keep the application local-first during Phase 1.
* Keep product behavior defined in `docs/PRODUCT.md`.
* Keep technical decisions documented in `docs/ARCHITECTURE.md`.

## Roadmap

### Phase 1 — Flashcard MVP

Build the Windows application with:

* task categories;
* ordered task backlogs;
* manual category prioritization;
* manual task prioritization;
* global round-robin task selection;
* one-task desktop widget;
* `Done`;
* temporary `Next`;
* Desktop mode;
* Floating mode;
* widget position and size persistence;
* automatic launch with Windows;
* local SQLite persistence.

### Phase 2 — Task Manager & Task Selection

Expand ApcoTask into a broader task-management system and introduce more sophisticated task-selection logic.

Potential future areas include:

* projects;
* richer priorities;
* deadlines;
* subtasks;
* dependencies;
* recurring tasks;
* configurable task-selection strategies.

Exact scope will be defined after validating the Phase 1 workflow.

### Phase 3 — Android Sync

Add cross-device functionality, including:

* user accounts;
* cloud synchronization;
* Android companion functionality;
* synchronized current task state;
* `Done` and `Next` from Android;
* gradual expansion toward a fuller mobile client.

## Development Philosophy

ApcoTask should remain production-shaped without becoming overengineered.

That means:

* clear separation of concerns;
* typed domain models;
* testable business logic;
* basic automated checks;
* simple architecture;
* minimal infrastructure;
* no unnecessary cloud services during the MVP;
* no premature abstraction for future features.

## License

TBD.
