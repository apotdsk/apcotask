# AGENTS.md

## Scope

Build ApcoTask incrementally and only implement the task currently requested.

Current target: **Phase 1 — Flashcard MVP**.

Do not implement Phase 2 task-selection features, cloud synchronization, authentication, or mobile functionality unless explicitly requested.

## Sources of Truth

* `docs/PRODUCT.md` — product behavior and scope.
* `docs/ARCHITECTURE.md` — technical and architectural decisions.
* `docs/DESIGN.md` — UI and visual rules.

Do not use the full PRD.

If an explicit user instruction conflicts with repository documentation, follow the user instruction.

## Engineering Rules

* Prefer the simplest implementation that satisfies the current requirement.
* Keep changes small and scoped.
* Do not modify unrelated code.
* Do not add dependencies unless necessary.
* Keep domain/business logic independent from React and Tauri where practical.
* Keep persistence separate from domain logic.
* Avoid premature abstractions for future phases.
* Use strict TypeScript typing and avoid `any`.
* Do not implement speculative features.
* If a product ambiguity affects expected behavior or test outcomes, stop before implementation and report it instead of inventing a requirement.

## Validation

Run relevant checks before considering work complete:

```bash
npm run typecheck
npm run lint
npm run test
```

For Tauri/native changes, also verify the application starts or builds successfully when applicable.

Fix failures introduced by the change.

## Documentation

Update documentation only when product behavior, architecture, setup, or development commands actually change.
