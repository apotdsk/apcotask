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

## Development Workflow

For non-trivial implementation tasks:

1. Inspect the relevant source files and documentation before coding.
2. When requested, define the implementation plan and tests before implementation and stop for approval.
3. Treat approved tests as the behavioral contract. Do not weaken, delete, or rewrite them merely to make implementation pass.
4. If an approved test appears incorrect or conflicts with `docs/PRODUCT.md`, stop and report the issue instead of changing the test.
5. After implementation, run the relevant validation checks and review the final diff for unintended or unrelated changes.
6. Report what was created or changed, validation results, and any remaining issues.

When architecture materially changes, update `docs/ARCHITECTURE.md` as part of the same task.

## Validation

Run relevant checks before considering work complete:

```bash
npm run typecheck
npm run lint
npm run test
```

For Tauri/native changes, also run the relevant Rust/Tauri checks or verify the application starts/builds successfully when applicable.

Review the final diff for unintended or unrelated changes.

Fix failures introduced by the change.

This means future prompts don't need to repeat `lint/typecheck/test/diff review` every time.

## Documentation

Update documentation only when product behavior, architecture, setup, or development commands actually change.
