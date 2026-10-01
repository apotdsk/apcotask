# ApcoTask — Product Specification

## Current Scope

Current development target: **Phase 1 — Flashcard MVP**.

ApcoTask is a Windows-first task manager that separates:

* **planning** — managing the backlog in the main application;
* **execution** — showing one actionable task at a time in a desktop widget.

Future task-selection algorithms and mobile synchronization are out of scope.

## Core Entities

### Category

```text
id
name
order
```

Category order represents priority.

### Task

```text
id
category_id
title
description
order
status
```

Status:

```text
active
completed
```

Task order represents priority within its category.

## Phase 1 Behavior

The user can:

* create, edit, delete, and reorder categories;
* create, edit, delete, and reorder tasks;
* move tasks between categories;
* view one current task in the widget;
* press `Done`;
* press `Next`.

All canonical data is stored locally.

## Phase 1 Domain Invariants

- Each task belongs to exactly one category at a time.
- Moving a task between categories changes its category membership.
- Category order determines category priority.
- Task order determines priority within a category.
- Only active tasks participate in the global sequence.
- Categories with no active tasks are ignored by selection.
- Global task order is deterministic round-robin across ordered categories.

## Task Selection

Phase 1 uses deterministic round-robin selection across ordered categories.

Example:

```text
Work:        W1 W2 W3
Programming: P1 P2 P3
German:      G1 G2 G3
```

produces:

```text
W1
P1
G1
W2
P2
G2
W3
P3
G3
```

Rules:

* completed tasks are excluded;
* categories without active tasks are skipped;
* task selection must be independent from React and Tauri-specific code.


## Done

`Done`:

1. marks the current task as completed;
2. persists the change;
3. selects the next eligible task.

Completed tasks no longer participate in task selection.

## Next

`Next` temporarily advances to another task.

It must not change:

* task status;
* task order;
* category;
* canonical backlog state.

Temporary skipping is execution/session state.

There is no `Previous` action.

## Widget

The widget shows only:

```text
CATEGORY

TASK TITLE

Optional description

DONE        NEXT
```

It supports:

* Floating mode;
* Desktop mode;
* moving;
* resizing;
* persisted position and dimensions.

## Persistence

Phase 1 uses local SQLite persistence.

Persist:

* categories;
* tasks;
* completion state;
* category order;
* task order;
* widget mode;
* widget position;
* widget size.

### Persistence Invariants

- Category `order` values must be unique.
- Task `order` values must be unique within the same category.
- The same task `order` value may be used in different categories.
- Every task must reference exactly one existing category.
- Deleting a category that still contains tasks must fail.
- Deleting a category must never automatically delete its tasks.
- Task status must be either `active` or `completed`.
- Persistence must not silently repair invalid ordering or category membership.

No account, backend, or cloud synchronization is used.

## Out of Scope

Do not implement unless explicitly requested:

* advanced task-selection algorithms;
* priority scoring;
* deadlines;
* projects;
* subtasks;
* dependencies;
* recurring tasks;
* authentication;
* cloud sync;
* Android integration;
* collaboration.

## Product Principle

Prefer the simplest implementation that validates this workflow:

```text
manage backlog
→ receive one task
→ Done / Next
→ receive next task
```
