# Handoff

<!--
Template rules:
- Overwritten at the end of every session. History lives in git and PLAN.md.
- Keep it under one page.
- "Next step" names a concrete first action, not a goal.
- "Gotchas" lists things the next session would otherwise rediscover the hard way.
-->

Date: 2026-10-04
Task: T07 — Application shell

## Done This Session

- Added configured main and widget windows with T07-only placeholder surfaces.
- Added a Rust-owned tray with Open backlog and Quit, main hide-on-close, prevented widget close, and shared show/restore/focus behavior.
- Added single-instance handling before database initialization so a repeated launch reopens the existing backlog instead of creating a second connection.
- Added typed `backlog-changed` event wrappers and focused tests.
- Scoped event capabilities to both windows and added production and development local-only CSPs.
- Recorded the approved lifecycle behavior in PRODUCT.md, ARCHITECTURE.md, and DECISIONS.md.
- Verified a second launch leaves one process. Automated TypeScript, frontend build, and Rust checks pass.

## Current State

- T07 is implemented but remains `[~]` until the owner completes the interactive tray, window-close, cross-window event, and two-window database console checks.
- The native app launches successfully with Tauri 2.11.5 and `tauri-plugin-single-instance` 2.4.5.
- All 133 TypeScript tests and all 16 Rust tests pass.

## Next Step

Run the T07 manual checklist from the implementation report in both WebView developer consoles, then approve T07 and mark it `[x]`.

## Open Questions / Blockers

- Interactive Windows UI and developer-console checks require the project owner's desktop session.

## Gotchas

- `tauri-plugin-single-instance` must remain the first registered plugin so the second process exits before database setup.
- Widget close is deliberately prevented because the approved tray menu has no widget restore command.
- T11–T13 still own widget content/dragging, window modes, and geometry persistence respectively.
- Running `npm run build` inside the restricted shell can fail while resolving `C:\Users\lenovo`; it passed outside that sandbox.
