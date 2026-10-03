import { afterAll, describe, expect, it } from 'vitest'
import type { Category, Task } from '../domain'
import type { PersistenceErrorCode } from './errors'
import { PersistenceError } from './errors'
import type { RepositoryContractHarness } from './contract'
import { createStubRepository, type Repository } from './repository'

const harness: RepositoryContractHarness = {
  async createRepository() {
    return createStubRepository()
  },
  async dispose() {},
}

async function repository(): Promise<Repository> {
  return harness.createRepository()
}

async function expectCode(
  operation: Promise<unknown>,
  code: PersistenceErrorCode,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: 'PersistenceError',
    code,
  } satisfies Partial<PersistenceError>)
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map(({ id }) => id)
}

function orders(items: readonly { order: number }[]): number[] {
  return items.map(({ order }) => order)
}

async function addCategories(
  repo: Repository,
  names: readonly string[],
): Promise<Category[]> {
  const categories: Category[] = []
  for (const name of names) categories.push(await repo.createCategory({ name }))
  return categories
}

async function addTask(
  repo: Repository,
  categoryId: string,
  title: string,
  description?: string,
): Promise<Task> {
  return repo.createTask({ categoryId, title, description })
}

async function addTasks(
  repo: Repository,
  categoryId: string,
  titles: readonly string[],
): Promise<Task[]> {
  const tasks: Task[] = []
  for (const title of titles) tasks.push(await addTask(repo, categoryId, title))
  return tasks
}

afterAll(async () => harness.dispose())

describe('category repository contract', () => {
  it.each(['', '   \t'])('rejects invalid category name %j', async (name) => {
    const repo = await repository()
    await expectCode(repo.createCategory({ name }), 'INVALID_INPUT')
  })

  it('allows duplicate category names', async () => {
    const repo = await repository()
    const created = await addCategories(repo, ['Same', 'Same'])
    expect(created[0].id).not.toBe(created[1].id)
  })

  it('creates and returns a category with the supplied name', async () => {
    const repo = await repository()
    expect(await repo.createCategory({ name: 'Work' })).toMatchObject({ name: 'Work' })
  })

  it('gets a stored category', async () => {
    const repo = await repository()
    const created = await repo.createCategory({ name: 'Work' })
    expect(await repo.getCategory(created.id)).toEqual(created)
  })

  it('returns undefined when getting an unknown category', async () => {
    const repo = await repository()
    expect(await repo.getCategory('missing')).toBeUndefined()
  })

  it('lists categories in category order', async () => {
    const repo = await repository()
    const [a, b, c] = await addCategories(repo, ['A', 'B', 'C'])
    await repo.reorderCategories([c.id, a.id, b.id])
    expect(ids(await repo.listCategories())).toEqual([c.id, a.id, b.id])
  })

  it('updates only a category name', async () => {
    const repo = await repository()
    const created = await repo.createCategory({ name: 'Old' })
    const updated = await repo.updateCategory(created.id, { name: 'New' })
    expect(updated).toEqual({ ...created, name: 'New' })
  })

  it.each(['', '\n  '])(
    'rejects invalid updated category name %j and changes nothing',
    async (name) => {
      const repo = await repository()
      const created = await repo.createCategory({ name: 'Original' })
      await expectCode(repo.updateCategory(created.id, { name }), 'INVALID_INPUT')
      expect(await repo.getCategory(created.id)).toEqual(created)
    },
  )

  it('rejects updating an unknown category', async () => {
    const repo = await repository()
    await expectCode(repo.updateCategory('missing', { name: 'New' }), 'NOT_FOUND')
  })

  it('deletes an empty category and closes the gap', async () => {
    const repo = await repository()
    const [a, b, c] = await addCategories(repo, ['A', 'B', 'C'])
    await repo.deleteCategory(b.id)
    expect(await repo.listCategories()).toEqual([{ ...a, order: 0 }, { ...c, order: 1 }])
  })

  it('rejects deleting an unknown category', async () => {
    const repo = await repository()
    await expectCode(repo.deleteCategory('missing'), 'NOT_FOUND')
  })

  it('appends the first category at order zero', async () => {
    const repo = await repository()
    expect((await repo.createCategory({ name: 'A' })).order).toBe(0)
  })

  it('appends new categories after existing categories', async () => {
    const repo = await repository()
    const categories = await addCategories(repo, ['A', 'B', 'C'])
    expect(orders(categories)).toEqual([0, 1, 2])
  })

  it('reorders the complete category list with contiguous zero-based values', async () => {
    const repo = await repository()
    const [a, b, c] = await addCategories(repo, ['A', 'B', 'C'])
    const reordered = await repo.reorderCategories([c.id, a.id, b.id])
    expect(ids(reordered)).toEqual([c.id, a.id, b.id])
    expect(orders(reordered)).toEqual([0, 1, 2])
  })

  it.each([
    ['a missing member', (items: readonly Category[]) => [items[0].id]],
    ['an unknown member', (items: readonly Category[]) => [items[0].id, items[1].id, 'missing']],
    ['a duplicate member', (items: readonly Category[]) => [items[0].id, items[1].id, items[1].id]],
  ])('rejects a category reorder with %s and changes nothing', async (_label, order) => {
    const repo = await repository()
    const categories = await addCategories(repo, ['A', 'B', 'C'])
    await expectCode(
      repo.reorderCategories(order(categories)),
      'INVALID_REORDER',
    )
    expect(await repo.listCategories()).toEqual(categories)
  })

  it('accepts an empty reorder for an empty category list', async () => {
    const repo = await repository()
    expect(await repo.reorderCategories([])).toEqual([])
  })
})

describe('task repository contract', () => {
  it.each(['', '  \t'])('rejects invalid task title %j', async (title) => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    await expectCode(repo.createTask({ categoryId: category.id, title }), 'INVALID_INPUT')
  })

  it('rejects creating a task in an unknown category', async () => {
    const repo = await repository()
    await expectCode(repo.createTask({ categoryId: 'missing', title: 'Task' }), 'CATEGORY_NOT_FOUND')
  })

  it('stores a supplied task description', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    expect(await addTask(repo, category.id, 'Task', 'Details')).toMatchObject({ description: 'Details' })
  })

  it.each([undefined, '', '  \n'])(
    'stores omitted, empty, or whitespace-only create description %j as no description',
    async (description) => {
      const repo = await repository()
      const category = await repo.createCategory({ name: 'A' })
      expect(await addTask(repo, category.id, 'Task', description)).not.toHaveProperty('description')
    },
  )

  it('creates an active task without a completion time', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    expect(await addTask(repo, category.id, 'Task')).toMatchObject({ status: 'active', completedAt: undefined })
  })

  it('gets a stored task', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    expect(await repo.getTask(task.id)).toEqual(task)
  })

  it('returns undefined when getting an unknown task', async () => {
    const repo = await repository()
    expect(await repo.getTask('missing')).toBeUndefined()
  })

  it('lists active and completed tasks in task order', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const first = await addTask(repo, category.id, 'First')
    const second = await addTask(repo, category.id, 'Second')
    await repo.completeTask(first.id, new Date('2026-01-01T00:00:00.000Z'))
    expect(ids(await repo.listTasks(category.id))).toEqual([first.id, second.id])
  })

  it('rejects listing tasks for an unknown category', async () => {
    const repo = await repository()
    await expectCode(repo.listTasks('missing'), 'CATEGORY_NOT_FOUND')
  })

  it('updates only task title and description', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Old', 'Old details')
    expect(await repo.updateTask(task.id, { title: 'New', description: 'New details' })).toEqual({
      ...task,
      title: 'New',
      description: 'New details',
    })
  })

  it.each([undefined, '', ' \t '])(
    'replaces description with no description when update description is %j',
    async (description) => {
      const repo = await repository()
      const category = await repo.createCategory({ name: 'A' })
      const task = await addTask(repo, category.id, 'Task', 'Old details')
      expect(await repo.updateTask(task.id, { title: 'Task', description })).not.toHaveProperty('description')
    },
  )

  it.each(['', '  '])('rejects invalid updated task title %j and changes nothing', async (title) => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Original')
    await expectCode(repo.updateTask(task.id, { title }), 'INVALID_INPUT')
    expect(await repo.getTask(task.id)).toEqual(task)
  })

  it('rejects updating an unknown task', async () => {
    const repo = await repository()
    await expectCode(repo.updateTask('missing', { title: 'Task' }), 'NOT_FOUND')
  })

  it('deletes a task and closes its category gap', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const [a, b, c] = await addTasks(repo, category.id, ['A', 'B', 'C'])
    await repo.deleteTask(b.id)
    expect(await repo.listTasks(category.id)).toEqual([{ ...a, order: 0 }, { ...c, order: 1 }])
  })

  it('rejects deleting an unknown task', async () => {
    const repo = await repository()
    await expectCode(repo.deleteTask('missing'), 'NOT_FOUND')
  })

  it('appends the first task at order zero', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    expect((await addTask(repo, category.id, 'Task')).order).toBe(0)
  })

  it('appends after active and completed tasks', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const first = await addTask(repo, category.id, 'First')
    await repo.completeTask(first.id, new Date('2026-01-01T00:00:00.000Z'))
    expect((await addTask(repo, category.id, 'Second')).order).toBe(1)
  })

  it('allows the same task order in different categories', async () => {
    const repo = await repository()
    const [a, b] = await addCategories(repo, ['A', 'B'])
    expect([(await addTask(repo, a.id, 'A1')).order, (await addTask(repo, b.id, 'B1')).order]).toEqual([0, 0])
  })

  it('reorders a complete task list with contiguous zero-based values', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const [a, b, c] = await addTasks(repo, category.id, ['A', 'B', 'C'])
    const reordered = await repo.reorderTasks(category.id, [c.id, a.id, b.id])
    expect(ids(reordered)).toEqual([c.id, a.id, b.id])
    expect(orders(reordered)).toEqual([0, 1, 2])
  })

  it('requires completed tasks in a complete task reorder', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const [a, b] = await addTasks(repo, category.id, ['A', 'B'])
    await repo.completeTask(a.id, new Date('2026-01-01T00:00:00.000Z'))
    await expectCode(repo.reorderTasks(category.id, [b.id]), 'INVALID_REORDER')
    expect(ids(await repo.listTasks(category.id))).toEqual([a.id, b.id])
  })

  it.each([
    ['a missing member', (items: readonly Task[]) => [items[0].id]],
    ['an unknown member', (items: readonly Task[]) => [items[0].id, items[1].id, 'missing']],
    ['a duplicate member', (items: readonly Task[]) => [items[0].id, items[1].id, items[1].id]],
  ])('rejects a task reorder with %s and changes nothing', async (_label, order) => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const tasks = await addTasks(repo, category.id, ['A', 'B', 'C'])
    await expectCode(
      repo.reorderTasks(category.id, order(tasks)),
      'INVALID_REORDER',
    )
    expect(await repo.listTasks(category.id)).toEqual(tasks)
  })

  it('rejects a task from another category in a reorder and changes nothing', async () => {
    const repo = await repository()
    const [a, b] = await addCategories(repo, ['A', 'B'])
    const aTask = await addTask(repo, a.id, 'A1')
    const bTask = await addTask(repo, b.id, 'B1')
    await expectCode(repo.reorderTasks(a.id, [bTask.id]), 'INVALID_REORDER')
    expect(await repo.listTasks(a.id)).toEqual([aTask])
    expect(await repo.listTasks(b.id)).toEqual([bTask])
  })

  it('rejects reordering tasks for an unknown category', async () => {
    const repo = await repository()
    await expectCode(repo.reorderTasks('missing', []), 'CATEGORY_NOT_FOUND')
  })

  it('accepts an empty reorder for an existing empty category', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    expect(await repo.reorderTasks(category.id, [])).toEqual([])
  })
})

describe('task membership contract', () => {
  it('moves a task to another category and appends it', async () => {
    const repo = await repository()
    const [source, target] = await addCategories(repo, ['Source', 'Target'])
    const moved = await addTask(repo, source.id, 'Moved')
    await addTask(repo, target.id, 'Existing')
    expect(await repo.moveTask(moved.id, target.id)).toMatchObject({ categoryId: target.id, order: 1 })
  })

  it('closes the source gap after moving a task', async () => {
    const repo = await repository()
    const [source, target] = await addCategories(repo, ['Source', 'Target'])
    const [a, b, c] = await addTasks(repo, source.id, ['A', 'B', 'C'])
    await repo.moveTask(b.id, target.id)
    expect(await repo.listTasks(source.id)).toEqual([{ ...a, order: 0 }, { ...c, order: 1 }])
  })

  it('preserves task content and lifecycle when moving it', async () => {
    const repo = await repository()
    const [source, target] = await addCategories(repo, ['Source', 'Target'])
    const task = await addTask(repo, source.id, 'Task', 'Details')
    const moved = await repo.moveTask(task.id, target.id)
    expect(moved).toMatchObject({ id: task.id, title: task.title, description: task.description, status: task.status })
  })

  it('moves a completed task', async () => {
    const repo = await repository()
    const [source, target] = await addCategories(repo, ['Source', 'Target'])
    const task = await addTask(repo, source.id, 'Task')
    const completed = await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
    expect(await repo.moveTask(task.id, target.id)).toMatchObject({
      categoryId: target.id,
      status: 'completed',
      completedAt: completed.completedAt,
    })
  })

  it('rejects moving an unknown task and changes nothing', async () => {
    const repo = await repository()
    const [source, target] = await addCategories(repo, ['Source', 'Target'])
    await expectCode(repo.moveTask('missing', target.id), 'NOT_FOUND')
    expect(await repo.listTasks(source.id)).toEqual([])
    expect(await repo.listTasks(target.id)).toEqual([])
  })

  it('rejects moving to an unknown category and changes nothing', async () => {
    const repo = await repository()
    const source = await repo.createCategory({ name: 'Source' })
    const task = await addTask(repo, source.id, 'Task')
    await expectCode(repo.moveTask(task.id, 'missing'), 'CATEGORY_NOT_FOUND')
    expect(await repo.listTasks(source.id)).toEqual([task])
  })

  it('rejects moving to the current category and changes nothing', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    await expectCode(repo.moveTask(task.id, category.id), 'INVALID_INPUT')
    expect(await repo.listTasks(category.id)).toEqual([task])
  })

  it.each(['active', 'completed'] as const)(
    'rejects deleting a category containing a %s task without deleting it',
    async (status) => {
      const repo = await repository()
      const category = await repo.createCategory({ name: 'A' })
      const task = await addTask(repo, category.id, 'Task')
      if (status === 'completed') await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
      await expectCode(repo.deleteCategory(category.id), 'CATEGORY_HAS_TASKS')
      expect(await repo.getTask(task.id)).toBeDefined()
    },
  )
})

describe('completed task lifecycle contract', () => {
  it('completes an active task at the supplied UTC time', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    expect(await repo.completeTask(task.id, new Date('2026-01-01T12:00:00.000Z'))).toEqual({
      ...task,
      status: 'completed',
      completedAt: '2026-01-01T12:00:00.000Z',
    })
  })

  it('preserves membership and order when completing a task', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    const completed = await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
    expect({ categoryId: completed.categoryId, order: completed.order }).toEqual({ categoryId: task.categoryId, order: task.order })
  })

  it('rejects completing an unknown task', async () => {
    const repo = await repository()
    await expectCode(repo.completeTask('missing', new Date()), 'NOT_FOUND')
  })

  it('rejects completing a completed task and leaves it unchanged', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    const completed = await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
    await expectCode(repo.completeTask(task.id, new Date('2026-01-02T00:00:00.000Z')), 'INVALID_STATUS')
    expect(await repo.getTask(task.id)).toEqual(completed)
  })

  it('reactivates a completed task and clears its completion time', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
    expect(await repo.reactivateTask(task.id)).toEqual(task)
  })

  it('preserves membership and order when reactivating a task', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    await repo.completeTask(task.id, new Date('2026-01-01T00:00:00.000Z'))
    const active = await repo.reactivateTask(task.id)
    expect({ categoryId: active.categoryId, order: active.order }).toEqual({ categoryId: task.categoryId, order: task.order })
  })

  it('rejects reactivating an unknown task', async () => {
    const repo = await repository()
    await expectCode(repo.reactivateTask('missing'), 'NOT_FOUND')
  })

  it('rejects reactivating an active task and leaves it unchanged', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    await expectCode(repo.reactivateTask(task.id), 'INVALID_STATUS')
    expect(await repo.getTask(task.id)).toEqual(task)
  })
})

describe('completed task cleanup contract', () => {
  async function completedTask(repo: Repository, completedAt: string): Promise<Task> {
    const category = await repo.createCategory({ name: completedAt })
    const task = await addTask(repo, category.id, completedAt)
    return repo.completeTask(task.id, new Date(completedAt))
  }

  it.each([
    ['exactly 24 hours old', '2026-01-01T12:00:00.000Z'],
    ['more than 24 hours old', '2025-12-31T12:00:00.000Z'],
  ])('deletes a completed task that is %s', async (_label, completedAt) => {
    const repo = await repository()
    const task = await completedTask(repo, completedAt)
    expect(await repo.purgeExpiredCompletedTasks(new Date('2026-01-02T12:00:00.000Z'))).toBe(1)
    expect(await repo.getTask(task.id)).toBeUndefined()
  })

  it('keeps a task completed less than 24 hours ago', async () => {
    const repo = await repository()
    const task = await completedTask(repo, '2026-01-01T12:00:00.001Z')
    expect(await repo.purgeExpiredCompletedTasks(new Date('2026-01-02T12:00:00.000Z'))).toBe(0)
    expect(await repo.getTask(task.id)).toEqual(task)
  })

  it('never deletes active tasks', async () => {
    const repo = await repository()
    const category = await repo.createCategory({ name: 'A' })
    const task = await addTask(repo, category.id, 'Task')
    await repo.purgeExpiredCompletedTasks(new Date('2100-01-01T00:00:00.000Z'))
    expect(await repo.getTask(task.id)).toEqual(task)
  })

  it('deletes expired tasks across categories', async () => {
    const repo = await repository()
    const first = await completedTask(repo, '2026-01-01T00:00:00.000Z')
    const second = await completedTask(repo, '2026-01-01T01:00:00.000Z')
    expect(await repo.purgeExpiredCompletedTasks(new Date('2026-01-03T00:00:00.000Z'))).toBe(2)
    expect(await repo.getTask(first.id)).toBeUndefined()
    expect(await repo.getTask(second.id)).toBeUndefined()
  })

  it('closes gaps independently while preserving survivor order', async () => {
    const repo = await repository()
    const [a, b] = await addCategories(repo, ['A', 'B'])
    const a1 = await addTask(repo, a.id, 'A1')
    const a2 = await addTask(repo, a.id, 'A2')
    const a3 = await addTask(repo, a.id, 'A3')
    const b1 = await addTask(repo, b.id, 'B1')
    const b2 = await addTask(repo, b.id, 'B2')
    await repo.completeTask(a2.id, new Date('2026-01-01T00:00:00.000Z'))
    await repo.completeTask(b1.id, new Date('2026-01-01T00:00:00.000Z'))
    await repo.purgeExpiredCompletedTasks(new Date('2026-01-02T00:00:00.000Z'))
    expect(await repo.listTasks(a.id)).toEqual([{ ...a1, order: 0 }, { ...a3, order: 1 }])
    expect(await repo.listTasks(b.id)).toEqual([{ ...b2, order: 0 }])
  })

  it('returns zero and changes nothing when no task is expired', async () => {
    const repo = await repository()
    const task = await completedTask(repo, '2026-01-02T00:00:00.001Z')
    expect(await repo.purgeExpiredCompletedTasks(new Date('2026-01-03T00:00:00.000Z'))).toBe(0)
    expect(await repo.getTask(task.id)).toEqual(task)
  })

  it('uses the supplied now instead of the system clock', async () => {
    const repo = await repository()
    const task = await completedTask(repo, '2000-01-01T00:00:00.000Z')
    expect(await repo.purgeExpiredCompletedTasks(new Date('2000-01-01T23:59:59.999Z'))).toBe(0)
    expect(await repo.getTask(task.id)).toEqual(task)
  })
})
