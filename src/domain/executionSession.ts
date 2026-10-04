import type { Category, Task } from './models'

export interface BacklogSnapshot {
  readonly categories: readonly Category[]
  readonly tasks: readonly Task[]
}

export interface ExecutionSession {
  readonly currentTaskId: string | undefined
  readonly previousSequenceIds: readonly string[]
}

function notImplemented(): never {
  throw new Error('not implemented')
}

export function createExecutionSession(
  _backlog: BacklogSnapshot,
): ExecutionSession {
  return notImplemented()
}

export function getCurrentTask(
  _session: ExecutionSession,
  _backlog: BacklogSnapshot,
): Task | undefined {
  return notImplemented()
}

export function getDoneTaskId(
  _session: ExecutionSession,
): string | undefined {
  return notImplemented()
}

export function advanceExecutionSession(
  _session: ExecutionSession,
  _backlog: BacklogSnapshot,
): ExecutionSession {
  return notImplemented()
}

export function recomputeExecutionSession(
  _session: ExecutionSession,
  _backlog: BacklogSnapshot,
): ExecutionSession {
  return notImplemented()
}
