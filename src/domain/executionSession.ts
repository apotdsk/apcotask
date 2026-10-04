import type { Category, Task } from './models'
import { buildActiveTaskSequence } from './taskSequence'

export interface BacklogSnapshot {
  readonly categories: readonly Category[]
  readonly tasks: readonly Task[]
}

export interface ExecutionSession {
  readonly currentTaskId: string | undefined
  readonly previousSequenceIds: readonly string[]
}

function activeSequence(backlog: BacklogSnapshot): Task[] {
  return buildActiveTaskSequence(backlog.categories, backlog.tasks)
}

function sessionAt(
  sequence: readonly Task[],
  currentTaskId: string | undefined,
): ExecutionSession {
  return {
    currentTaskId,
    previousSequenceIds: sequence.map(({ id }) => id),
  }
}

export function createExecutionSession(
  backlog: BacklogSnapshot,
): ExecutionSession {
  const sequence = activeSequence(backlog)
  return sessionAt(sequence, sequence[0]?.id)
}

export function getCurrentTask(
  session: ExecutionSession,
  backlog: BacklogSnapshot,
): Task | undefined {
  return activeSequence(backlog).find(({ id }) => id === session.currentTaskId)
}

export function getDoneTaskId(
  session: ExecutionSession,
): string | undefined {
  return session.currentTaskId
}

export function advanceExecutionSession(
  session: ExecutionSession,
  backlog: BacklogSnapshot,
): ExecutionSession {
  const sequence = activeSequence(backlog)
  if (sequence.length === 0) return sessionAt(sequence, undefined)

  const currentIndex = sequence.findIndex(({ id }) => id === session.currentTaskId)
  if (currentIndex === -1) return recomputeExecutionSession(session, backlog)

  const nextIndex = (currentIndex + 1) % sequence.length
  return sessionAt(sequence, sequence[nextIndex]?.id)
}

export function recomputeExecutionSession(
  session: ExecutionSession,
  backlog: BacklogSnapshot,
): ExecutionSession {
  const sequence = activeSequence(backlog)
  if (sequence.length === 0) return sessionAt(sequence, undefined)

  const activeIds = new Set(sequence.map(({ id }) => id))
  if (session.currentTaskId !== undefined && activeIds.has(session.currentTaskId)) {
    return sessionAt(sequence, session.currentTaskId)
  }

  const previousCurrentIndex = session.previousSequenceIds.findIndex(
    (id) => id === session.currentTaskId,
  )
  if (previousCurrentIndex !== -1) {
    for (let offset = 1; offset < session.previousSequenceIds.length; offset += 1) {
      const candidateIndex =
        (previousCurrentIndex + offset) % session.previousSequenceIds.length
      const candidateId = session.previousSequenceIds[candidateIndex]
      if (candidateId !== undefined && activeIds.has(candidateId)) {
        return sessionAt(sequence, candidateId)
      }
    }
  }

  return sessionAt(sequence, sequence[0]?.id)
}
