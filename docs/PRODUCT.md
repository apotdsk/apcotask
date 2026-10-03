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

Rules:

* `name` is required and must not be empty after trimming.
* Category names do not need to be unique.

### Task

```text
id
category_id
title
description    (optional)
order
status
completed_at   (set only while completed)
```

Status:

```text
active
completed
```

Task order represents priority within its category.

Rules:

* `title` is required and must not be empty after trimming.
* `description` is optional.
* `completed_at` is set when a task is completed and cleared when it is marked active again.

## Phase 1 Behavior

The user can:

* create, edit, delete, and reorder categories;
* create, edit, delete, and reorder tasks;
* move tasks between categories;
* see recently completed tasks in the backlog and mark them active again;
* view one current task in the widget;
* press `Done`;
* press `Next`;
* change settings in the main window: widget mode and start with Windows.

All canonical data is stored locally on the device.

## Phase 1 Domain Invariants

- Each task belongs to exactly one category at a time.
- Moving a task between categories changes its category membership.
- Category order determines category priority.
- Task order determines priority within a category.
- Only active tasks participate in the global sequence.
- Categories with no active tasks are ignored by selection.
- Global task order is deterministic round-robin across ordered categories.

## Ordering

- New categories and tasks are appended at the end of their list.
- Reordering submits the complete new order of one list (all categories, or all tasks in one category) as a single operation. The submitted IDs must exactly match the current members of that list; otherwise the operation fails and nothing changes.
- Moving a task to another category appends it to the end of the target category.
- Order values within a list are contiguous, starting at 0. Deleting or moving an item closes the gap in its former list.
- Editing a category or task cannot change its order or category membership; only reorder and move can.
- Completed tasks keep their position in their category and count toward order uniqueness until they are deleted.
- A reactivated task keeps its position.

## Completed Tasks

- A completed task stays visible in the backlog for 24 hours after it was completed.
- During that time it can be marked active again. It keeps its position.
- After 24 hours it is permanently deleted, and the gap in its category closes.
- This is the only automatic deletion in the application.

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
* the global sequence is recomputed from canonical data whenever that data changes;
* task selection must be independent from React and Tauri-specific code.

## Done

`Done`:

1. marks the current task as completed;
2. persists the change;
3. shows the task that followed it in the global sequence.

Completed tasks no longer participate in task selection.

## Next

`Next` advances to the following task in the global sequence.

* After the last task in the sequence, `Next` wraps around to the first task.
* If only one active task exists, `Next` keeps showing it.
* Skipped tasks are not removed from the sequence; they appear again after wrap-around.

It must not change:

* task status;
* task order;
* category;
* canonical backlog state.

Temporary skipping is execution/session state.

There is no `Previous` action.

## Execution Session

- When the widget starts, it shows the first task of the global sequence.
- The current position is not persisted. After an application restart, the sequence starts from the first task.
- If there are no active tasks, the widget shows "No active tasks" and `Done` and `Next` are disabled.
- When the backlog changes during a session, the sequence is recomputed:
  - if the current task is still active, it stays current, and `Next` continues from its new place in the sequence;
  - if the current task was completed or deleted, the widget shows the task that would have followed it.

## Widget

The widget shows only:

```text
CATEGORY

TASK TITLE

Optional description

DONE        NEXT
```

or, when no active tasks exist, the empty state described above.

Modes:

* **Floating mode** — the widget stays on top of other windows.
* **Desktop mode** — the widget sits on the desktop behind other windows.

It supports:

* moving;
* resizing;
* persisted mode, position, and dimensions.

If the saved position is no longer visible (for example, a monitor was disconnected), the widget appears on the primary monitor.

## Settings

Settings are changed in the main window:

* **Widget mode** — Floating or Desktop.
* **Start with Windows** — a toggle, off by default.

## Application Lifecycle

- The application shows a system tray icon with the menu items **Open backlog** and **Quit**.
- Closing the main window hides it; the widget keeps running.
- **Quit** exits the application, closing all windows.
- When started manually, the application opens the main window and the widget.
- When started automatically with Windows, the application opens only the widget; the main window stays hidden until opened from the tray.

## Persistence

Persist locally:

* categories;
* tasks;
* completion state and completion time;
* category order;
* task order;
* widget mode;
* widget position;
* widget size;
* the start-with-Windows setting.

### Persistence Invariants

- Category `order` values must be unique.
- Task `order` values must be unique within the same category.
- The same task `order` value may be used in different categories.
- Every task must reference exactly one existing category.
- Deleting a category that still contains tasks, including completed tasks, must fail.
- Deleting a category must never automatically delete its tasks.
- Task status must be either `active` or `completed`.
- A task has a completion time if and only if its status is `completed`.
- An operation that would produce invalid ordering or category membership fails as a whole and leaves stored data unchanged.

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
