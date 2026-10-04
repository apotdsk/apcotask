# AGENTS.md

## Scope

Build ApcoTask incrementally and only implement the task currently requested.

Current target: **Phase 1 — Flashcard MVP**.

Do not implement Phase 2 task-selection features, cloud synchronization, authentication, or mobile functionality unless explicitly requested.

## Sources of Truth

* `docs/PRODUCT.md` — product behavior and scope.
* `docs/ARCHITECTURE.md` — technical and architectural decisions.
* For UI tasks, read `docs/DESIGN.md` before planning and use Impeccable as the design assistant. `docs/DESIGN.md` wins any conflict with Impeccable's defaults; do not drift toward generic SaaS or dashboard patterns.
* `docs/DECISIONS.md` — reasons behind decisions, and open decisions.
* `docs/PLAN.md` — task list and status.
* `docs/HANDOFF.md` — state at the end of the last session.

Do not use the full PRD.

If an explicit user instruction conflicts with repository documentation, follow the user instruction, state the conflict in your report, and propose the documentation change.

If code and `docs/PRODUCT.md` disagree, stop and ask. Never change `docs/PRODUCT.md` to match the code.

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
* In plans, mark every behavior not defined in docs/PRODUCT.md or docs/ARCHITECTURE.md as "Proposed decision" so it can be approved explicitly.
* In plans, list every file to be created or changed, including files outside the task's main folder.

## Session Workflow

Work on one task from `docs/PLAN.md` per session unless instructed otherwise.

At session start:

1. Read `docs/HANDOFF.md` and the requested task in `docs/PLAN.md`. Read other documents only as the task requires.
2. Summarize the task, its "Done when" criteria, and any blocker before changing anything.

At session end, or when asked to close the session:

1. Update the task status in `docs/PLAN.md`. Do not add, remove, or reorder tasks without approval; propose new tasks in your report instead.
2. Mark the task [x] once the project owner has approved it. Committing is the owner's step and does not keep the task open.
3. Overwrite `docs/HANDOFF.md` following its template.
4. State whether `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, or `docs/DECISIONS.md` need changes, and show the proposed diff.

## Development Workflow

For non-trivial implementation tasks:

1. Inspect the relevant source files and documentation before coding.
2. When requested, define the implementation plan and tests before implementation and stop for approval.
3. Treat approved tests as the behavioral contract. Do not weaken, delete, or rewrite them merely to make implementation pass.
4. If an approved test appears incorrect or conflicts with `docs/PRODUCT.md`, stop and report the issue instead of changing the test.
5. After implementation, run the relevant validation checks and review the final diff for unintended or unrelated changes.
6. Report what was created or changed, validation results, and any remaining issues.

Do not commit or push unless explicitly asked.

* Tests: one behavior per test, no test that only repeats another test's assertion, and test.each for input variants of the same rule.

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

Do not claim a check passed unless it actually ran successfully in this session. Paste the summary lines of each check in your report.

## Documentation

* `docs/PRODUCT.md` is the requirement. Propose changes to it and wait for approval; never edit it as a side effect of implementation.
* If a task changes structure, schema, dependencies, data flow, or ownership rules, update `docs/ARCHITECTURE.md` in the same task.
* Record non-obvious choices in `docs/DECISIONS.md` as a new entry. Never edit existing entries; a reversed decision gets a new entry that references the old one. Move resolved items out of "Open Decisions".
* Change `docs/DESIGN.md` only with approval.
* Update setup instructions and development commands when they change.
* Keep PRODUCT.md and ARCHITECTURE.md describing the current state; history belongs in DECISIONS.md and git.
