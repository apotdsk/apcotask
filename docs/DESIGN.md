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

## Design Rule

When choosing between two implementations, prefer the one that exposes **less unnecessary information while preserving usability**.

The core design question is:

> What does the user need to see to act on the current task?

## Main Application

The main window is the **planning interface**.

Its purpose is to manage:

* categories;
* tasks;
* ordering.

The backlog should remain easy to scan and edit without unnecessary dashboards, statistics, or navigation layers.

Avoid excessive use of cards and nested containers.

### Layout

- A single column. Categories appear as section headings in priority order; each category's tasks are listed below its heading.
- A **Settings** button at the top right opens the settings view in the same window. Settings contain widget mode and start with Windows.
- Default window size: about 720 × 800 px. Minimum: 480 × 400 px.

### Interactions

- **Create:** an input at the end of each category adds a task. An input at the end of the list adds a category.
- **Edit:** clicking a category name or task title edits it in place. A task's description is edited in the same expanded row.
- **Reorder:** drag by a visible handle. Keyboard alternative: `Alt+↑` / `Alt+↓` on the focused item.
- **Move a task:** a "Move to…" menu on each task lists the other categories.
- **Delete:** a short inline confirmation, "Delete? Yes / No", for tasks and categories.
- **Completed tasks:** stay in place, shown with a strikethrough and a check mark (never color alone), with a "Restore" action until they are purged.

### Messages

Errors appear as a short message next to the affected item, never as a modal dialog.

| Situation | Message |
| --- | --- |
| Deleting a category that still has tasks | Remove its tasks first. |
| Concurrent change (`CONFLICT`) | Changed in the other window. Try again. |
| Empty name or title | Enter a name. / Enter a title. |
| Unexpected failure | Something went wrong. Try again. |

### Empty States

- No categories: only the "Add category" input, with the placeholder "Add your first category".
- A category without tasks: only its "Add task" input.

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

### Window

- No title bar. The widget is moved by dragging any empty area or the category line, and resized from its edges.
- Default size: about 320 × 200 px. Minimum: 240 × 140 px.
- Opaque neutral background with a 1 px border, identical in Floating and Desktop mode. No transparency: in Desktop mode the widget sits on the wallpaper.

### Long Text

- The task title wraps up to 3 lines, then ends with an ellipsis.
- The description wraps up to 4 lines, then ends with an ellipsis.
- Truncated text shows its full content as a native tooltip on hover.

### Empty State

The widget shows "No active tasks" in place of the title. `Done` and `Next` are visible but disabled.

## Typography

All fonts are bundled with the application as local font files. No font is loaded from the internet.

| Role | Font stack | Size | Weight |
| --- | --- | --- | --- |
| Widget task title | `'Agdasima', 'Oswald', sans-serif` | 1.75rem | 700 |
| Main window category heading | `'Agdasima', 'Oswald', sans-serif` | 1.25rem | 700 |
| Widget category label | `'Inter', system-ui, sans-serif`, uppercase, letter-spacing 0.08em | 0.75rem | 600 |
| Task title in main window | `'Inter', system-ui, sans-serif` | 1rem | 500 |
| Description, body, controls | `'Inter', system-ui, sans-serif` | 0.875rem | 400 |

- Agdasima covers Latin text. Oswald, a condensed font with Cyrillic support, follows it in the stack, so Cyrillic characters fall back to a visually related condensed font instead of a generic one.
- Inter covers both Latin and Cyrillic for all other text.
- Hierarchy comes from size, weight, and spacing. All text uses the same text color; there is no separate muted-text color.
- Minimum text size anywhere: 0.75rem.

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

### Theme

The interface follows the Windows light/dark setting.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#FFFFFF` | `#1C1C1E` |
| Surface (hover, inputs) | `#F4F4F2` | `#2A2A2C` |
| Text | `#1A1A1A` | `#F2F2F2` |
| Border | `#D4D4D0` | `#3A3A3C` |
| Focus ring | `#2563EB` | `#60A5FA` |
| Error text | `#B42318` | `#F97066` |

The focus ring is the only accent color.

### Shape

- Border width: 1px.
- Corner radius: 0.25rem for inputs and buttons. Lists and sections have no rounded containers.
- Shadows: none, except an optional 1px-offset shadow on the widget window edge.

## Layout

Spacing scale: `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`. No other spacing values.

Interfaces should remain usable at different window and widget sizes.

Long task titles and descriptions must degrade gracefully through wrapping, truncation, or layout adaptation rather than breaking the interface.

## Controls

Controls should:

* be clearly interactive;
* have visible hover/focus states;
* support keyboard navigation where practical;
* avoid relying only on color to communicate state.

`Done` and `Next` should be visually easy to locate without competing with the task title.

- `Done`: filled button using the text color as background and the background color as text.
- `Next`: bordered button.
- Both are reachable with `Tab` and activated with `Enter` or `Space`. There are no single-key shortcuts.
- Disabled buttons use reduced emphasis plus the `disabled` state, never color alone.

## Motion

No decorative animation. Hover and focus changes may use a transition of at most 100 ms. Respect the system "reduce motion" setting by removing transitions entirely.

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

## Language

The interface language is English. Task and category content may be in any language, including Ukrainian.
