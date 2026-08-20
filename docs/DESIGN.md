# ApcoTask — Design

## Direction

ApcoTask should feel like a **small native desktop utility**, not a SaaS dashboard or full project-management platform.

The interface is:

* minimal;
* typography-first;
* quiet;
* functional;
* focused on the current action.

Prefer whitespace, alignment, and typography over decorative UI.

## Main Application

The main window is the **planning interface**.

Its purpose is to manage:

* categories;
* tasks;
* ordering.

The backlog should remain easy to scan and edit without unnecessary dashboards, statistics, or navigation layers.

Avoid excessive use of cards and nested containers.

## Widget

The widget is the **execution interface**.

It shows exactly one task.

Basic structure:

```text
CATEGORY

TASK TITLE

Optional description

DONE                NEXT
```

The current task should dominate the visual hierarchy.

### Information Priority

1. Task title
2. Category
3. Description
4. Actions

The widget must not show:

* other tasks;
* backlog previews;
* progress charts;
* statistics;
* unnecessary navigation.

## Typography

Preferred direction:

* condensed or distinctive typeface such as **Agdasima** for prominent headings or task titles;
* **Inter**, system UI, or another highly readable sans-serif for descriptions and utility text.

Readability takes priority over maintaining a particular font.

## Visual Style

Prefer:

* neutral surfaces;
* strong text contrast;
* restrained borders;
* minimal shadows;
* limited icon usage;
* consistent spacing;
* clearly differentiated interactive states.

Avoid:

* gradients without functional purpose;
* glassmorphism;
* large shadows;
* excessive rounded cards;
* colorful dashboard aesthetics;
* decorative animation;
* visual elements without informational value.

## Layout

Use a small and consistent spacing system.

Interfaces should remain usable at different window and widget sizes.

Long task titles and descriptions must degrade gracefully through wrapping, truncation, or layout adaptation rather than breaking the interface.

## Controls

Controls should:

* be clearly interactive;
* have visible hover/focus states;
* support keyboard navigation where practical;
* avoid relying only on color to communicate state.

`Done` and `Next` should be visually easy to locate without competing with the task title.

## Widget Modes

Floating and Desktop modes should share the same visual design.

Changing mode changes window behavior, not the task interface.

Moving, resizing, or switching modes should not visually reset the widget.

## Accessibility

Follow basic WCAG 2.1 AA principles where applicable:

* sufficient contrast;
* visible keyboard focus;
* readable font sizes;
* keyboard-accessible controls;
* no state communicated by color alone.

## Design Rule

When choosing between two implementations, prefer the one that exposes **less unnecessary information while preserving usability**.

The core design question is:

> What does the user need to see to act on the current task?

## UI Implementation

Use Impeccable as the primary AI-assisted tool for implementing and refining the frontend design.

Impeccable should follow this document as the visual source of truth.

Do not let generated UI drift toward generic SaaS/dashboard patterns that conflict with the design direction defined here.