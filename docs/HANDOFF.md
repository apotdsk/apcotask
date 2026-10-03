# Handoff

<!--
Template rules:
- Overwritten at the end of every session. History lives in git and PLAN.md.
- Keep it under one page.
- "Next step" names a concrete first action, not a goal.
- "Gotchas" lists things the next session would otherwise rediscover the hard way.
-->

Date: 2026-10-01
Task: preparation for T01

## Done This Session

- Revised docs/PRODUCT.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, AGENTS.md.
- Created docs/PLAN.md and docs/HANDOFF.md.

## Current State

- Task-selection domain logic and its tests pass.
- - The earlier draft persistence tests were deleted; T01 writes new ones from scratch.
- No persistence implementation, SQLite dependency, or migrations exist yet.

## Next Step

Start T01: create the repository stub and rewrite the persistence contract tests according to the revised docs.

## Open Questions / Blockers

- None blocking T01. Open technical decisions are listed in docs/DECISIONS.md.

## Gotchas

- `ORDER` is an SQL keyword; the column is `position`.
- SQLite foreign keys are off unless enabled per connection.
- Unique position constraints fail on direct swaps; reorder uses temporary negative positions inside a transaction.
