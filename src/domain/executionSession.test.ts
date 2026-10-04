import { describe, expect, it, test } from 'vitest'
import type { Category, Task, TaskStatus } from './models'
import {
  advanceExecutionSession,
  type BacklogSnapshot,
  createExecutionSession,
  getCurrentTask,
  getDoneTaskId,
  recomputeExecutionSession,
} from './executionSession'

function category(id: string, order: number): Category {
  return { id, name: `Category ${id}`, order }
}

function task(
  id: string,
  categoryId: string,
  order: number,
  status: TaskStatus = 'active',
): Task {
  return {
    id,
    categoryId,
    title: id,
    order,
    status,
    ...(status === 'completed' ? { completedAt: '2026-10-04T12:00:00.000Z' } : {}),
  }
}

function backlog(
  categories: readonly Category[],
  tasks: readonly Task[],
): BacklogSnapshot {
  return { categories, tasks }
}

function currentTaskId(
  session: ReturnType<typeof createExecutionSession>,
  snapshot: BacklogSnapshot,
): string | undefined {
  return getCurrentTask(session, snapshot)?.id
}

const categories = [category('A', 0), category('B', 1), category('C', 2)]
const activeTasks = [
  task('A1', 'A', 0),
  task('A2', 'A', 1),
  task('B1', 'B', 0),
  task('B2', 'B', 1),
]

describe('execution session startup', () => {
  it('starts with the first task of the active global sequence', () => {
    const snapshot = backlog(
      [category('B', 1), category('A', 0)],
      [task('B1', 'B', 0), task('A1', 'A', 0)],
    )

    const session = createExecutionSession(snapshot)

    expect(currentTaskId(session, snapshot)).toBe('A1')
  })

  it('starts from the first task again in a new session', () => {
    const snapshot = backlog(categories, activeTasks)
    const firstSession = createExecutionSession(snapshot)
    const advancedSession = advanceExecutionSession(firstSession, snapshot)
    expect(currentTaskId(advancedSession, snapshot)).toBe('B1')

    const restartedSession = createExecutionSession(snapshot)

    expect(currentTaskId(restartedSession, snapshot)).toBe('A1')
  })
})

describe('Next', () => {
  it('advances to the following task', () => {
    const snapshot = backlog(categories, activeTasks)
    const session = createExecutionSession(snapshot)

    const advanced = advanceExecutionSession(session, snapshot)

    expect(currentTaskId(advanced, snapshot)).toBe('B1')
  })

  it('wraps from the final task to the first task', () => {
    const snapshot = backlog(
      [category('A', 0)],
      [task('A1', 'A', 0), task('A2', 'A', 1)],
    )
    const first = createExecutionSession(snapshot)
    const last = advanceExecutionSession(first, snapshot)

    const wrapped = advanceExecutionSession(last, snapshot)

    expect(currentTaskId(wrapped, snapshot)).toBe('A1')
  })

  it('keeps the only active task current', () => {
    const snapshot = backlog([category('A', 0)], [task('A1', 'A', 0)])
    const session = createExecutionSession(snapshot)

    const advanced = advanceExecutionSession(session, snapshot)

    expect(currentTaskId(advanced, snapshot)).toBe('A1')
  })

  it('returns skipped tasks after wrapping around', () => {
    const snapshot = backlog(
      [category('A', 0)],
      [task('A1', 'A', 0), task('A2', 'A', 1), task('A3', 'A', 2)],
    )
    const first = createExecutionSession(snapshot)
    const second = advanceExecutionSession(first, snapshot)
    const third = advanceExecutionSession(second, snapshot)

    const wrapped = advanceExecutionSession(third, snapshot)

    expect(currentTaskId(wrapped, snapshot)).toBe('A1')
  })

  it('does not mutate canonical backlog data', () => {
    const snapshot = backlog(categories, activeTasks)
    const before = structuredClone(snapshot)
    const session = createExecutionSession(snapshot)

    advanceExecutionSession(session, snapshot)

    expect(snapshot).toEqual(before)
  })
})

describe('Done', () => {
  it('identifies the current task as the completion target without changing it', () => {
    const snapshot = backlog(categories, activeTasks)
    const session = createExecutionSession(snapshot)

    const targetId = getDoneTaskId(session)

    expect(targetId).toBe('A1')
    expect(snapshot.tasks[0]?.status).toBe('active')
  })

  test.each([
    {
      name: 'a task in the middle of the sequence',
      before: backlog(categories, activeTasks),
      advances: 1,
      completedId: 'B1',
      expectedId: 'A2',
    },
    {
      name: 'the final task in the sequence',
      before: backlog(categories, activeTasks),
      advances: 3,
      completedId: 'B2',
      expectedId: 'A1',
    },
  ])('continues with the following task after completing $name', ({
    before,
    advances,
    completedId,
    expectedId,
  }) => {
    let session = createExecutionSession(before)
    for (let index = 0; index < advances; index += 1) {
      session = advanceExecutionSession(session, before)
    }
    expect(getDoneTaskId(session)).toBe(completedId)
    const after = backlog(
      before.categories,
      before.tasks.map((item) =>
        item.id === completedId
          ? { ...item, status: 'completed', completedAt: '2026-10-04T12:00:00.000Z' }
          : item,
      ),
    )

    const recomputed = recomputeExecutionSession(session, after)

    expect(currentTaskId(recomputed, after)).toBe(expectedId)
  })

  it('enters the empty state after completing the only active task', () => {
    const before = backlog([category('A', 0)], [task('A1', 'A', 0)])
    const session = createExecutionSession(before)
    const after = backlog(
      before.categories,
      [task('A1', 'A', 0, 'completed')],
    )

    const recomputed = recomputeExecutionSession(session, after)

    expect(getCurrentTask(recomputed, after)).toBeUndefined()
    expect(getDoneTaskId(recomputed)).toBeUndefined()
  })
})

describe('backlog recomputation', () => {
  const base = backlog(categories, [
    task('A1', 'A', 0),
    task('A2', 'A', 1, 'completed'),
    task('A3', 'A', 2),
    task('B1', 'B', 0),
    task('B2', 'B', 1),
  ])

  test.each([
    {
      name: 'reordering categories',
      changed: backlog(
        [category('B', 0), category('A', 1), category('C', 2)],
        base.tasks,
      ),
      expectedNextId: 'A1',
    },
    {
      name: 'moving the current task to another category',
      changed: backlog(categories, [
        task('A1', 'A', 0),
        task('A2', 'A', 1, 'completed'),
        task('A3', 'A', 2),
        task('B1', 'A', 3),
        task('B2', 'B', 0),
      ]),
      expectedNextId: 'A1',
    },
    {
      name: 'creating a new task',
      changed: backlog(categories, [...base.tasks, task('C1', 'C', 0)]),
      expectedNextId: 'C1',
    },
    {
      name: 'reactivating a completed task',
      changed: backlog(
        categories,
        base.tasks.map((item) =>
          item.id === 'A2'
            ? { ...item, status: 'active', completedAt: undefined }
            : item,
        ),
      ),
      expectedNextId: 'A2',
    },
  ])('keeps the current task and follows its new place after $name', ({
    changed,
    expectedNextId,
  }) => {
    const started = createExecutionSession(base)
    const current = advanceExecutionSession(started, base)
    expect(currentTaskId(current, base)).toBe('B1')

    const recomputed = recomputeExecutionSession(current, changed)
    expect(currentTaskId(recomputed, changed)).toBe('B1')

    const advanced = advanceExecutionSession(recomputed, changed)
    expect(currentTaskId(advanced, changed)).toBe(expectedNextId)
  })

  it('selects the previous follower when the current task is deleted', () => {
    const before = backlog(categories, activeTasks)
    const started = createExecutionSession(before)
    const current = advanceExecutionSession(started, before)
    const after = backlog(
      before.categories,
      before.tasks.filter(({ id }) => id !== 'B1'),
    )

    const recomputed = recomputeExecutionSession(current, after)

    expect(currentTaskId(recomputed, after)).toBe('A2')
  })

  test.each([
    {
      name: 'a later task survives',
      advances: 0,
      after: backlog(
        [category('B', 0), category('A', 1)],
        [task('B1', 'B', 0), task('A4', 'A', 0)],
      ),
      expectedId: 'A4',
    },
    {
      name: 'the search wraps around the previous sequence',
      advances: 2,
      after: backlog(
        [category('B', 0), category('A', 1)],
        [task('B1', 'B', 0), task('A1', 'A', 0), task('A2', 'A', 1)],
      ),
      expectedId: 'A1',
    },
    {
      name: 'only new tasks survive',
      advances: 0,
      after: backlog(
        [category('B', 0)],
        [task('B1', 'B', 0), task('B2', 'B', 1)],
      ),
      expectedId: 'B1',
    },
  ])('selects the correct task when $name', ({ advances, after, expectedId }) => {
    const before = backlog(
      [category('A', 0)],
      [
        task('A1', 'A', 0),
        task('A2', 'A', 1),
        task('A3', 'A', 2),
        task('A4', 'A', 3),
      ],
    )
    let session = createExecutionSession(before)
    for (let index = 0; index < advances; index += 1) {
      session = advanceExecutionSession(session, before)
    }

    const recomputed = recomputeExecutionSession(session, after)

    expect(currentTaskId(recomputed, after)).toBe(expectedId)
  })
})

describe('empty state', () => {
  it('has no current task or Done target and Next remains empty', () => {
    const snapshot = backlog(
      [category('A', 0)],
      [task('A1', 'A', 0, 'completed')],
    )

    const session = createExecutionSession(snapshot)
    const advanced = advanceExecutionSession(session, snapshot)

    expect(getCurrentTask(session, snapshot)).toBeUndefined()
    expect(getDoneTaskId(session)).toBeUndefined()
    expect(getCurrentTask(advanced, snapshot)).toBeUndefined()
  })

  it('becomes empty when a backlog change removes the last active task', () => {
    const before = backlog([category('A', 0)], [task('A1', 'A', 0)])
    const session = createExecutionSession(before)
    const after = backlog([category('A', 0)], [])

    const recomputed = recomputeExecutionSession(session, after)

    expect(getCurrentTask(recomputed, after)).toBeUndefined()
    expect(getDoneTaskId(recomputed)).toBeUndefined()
  })
})
