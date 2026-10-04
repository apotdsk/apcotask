import type { Category, Task, TaskStatus } from '../domain'
import {
  BatchExpectationError,
  type BatchStatement,
  type PersistenceDriver,
} from './driver'
import { PersistenceError } from './errors'
import { withSqliteErrorMapping } from './errorMapping'
import { createStubRepository, type Repository } from './repository'

interface CategoryRow {
  readonly id: string
  readonly name: string
  readonly position: number
}

interface TaskRow {
  readonly id: string
  readonly category_id: string
  readonly title: string
  readonly description: string | null
  readonly position: number
  readonly status: TaskStatus
  readonly completed_at: string | null
}

function categoryFromRow(row: CategoryRow): Category {
  return { id: row.id, name: row.name, order: row.position }
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    order: row.position,
    status: row.status,
    completedAt: row.completed_at ?? undefined,
  }
}

function validateName(name: string): void {
  if (name.trim().length === 0) throw new PersistenceError('INVALID_INPUT')
}

function validateTitle(title: string): void {
  if (title.trim().length === 0) throw new PersistenceError('INVALID_INPUT')
}

function normalizeDescription(description: string | undefined): string | null {
  return description === undefined || description.trim().length === 0 ? null : description
}

async function selectCategories(driver: PersistenceDriver): Promise<Category[]> {
  const rows = await driver.select<CategoryRow>(
    'SELECT id, name, position FROM categories ORDER BY position',
  )
  return rows.map(categoryFromRow)
}

async function selectTasks(driver: PersistenceDriver, categoryId: string): Promise<Task[]> {
  const rows = await driver.select<TaskRow>(
    `SELECT id, category_id, title, description, position, status, completed_at
     FROM tasks
     WHERE category_id = ?
     ORDER BY position`,
    [categoryId],
  )
  return rows.map(taskFromRow)
}

async function selectTask(driver: PersistenceDriver, id: string): Promise<Task | undefined> {
  const [row] = await driver.select<TaskRow>(
    `SELECT id, category_id, title, description, position, status, completed_at
     FROM tasks
     WHERE id = ?`,
    [id],
  )
  return row === undefined ? undefined : taskFromRow(row)
}

async function categoryExists(driver: PersistenceDriver, id: string): Promise<boolean> {
  const [row] = await driver.select<{ id: string }>(
    'SELECT id FROM categories WHERE id = ?',
    [id],
  )
  return row !== undefined
}

const MAX_STALE_READ_ATTEMPTS = 3

async function withStaleReadRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_STALE_READ_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof BatchExpectationError)) throw error
      if (attempt === MAX_STALE_READ_ATTEMPTS) {
        throw new PersistenceError(
          'CONFLICT',
          'The data changed while the operation was in progress. Please try again.',
          { cause: error },
        )
      }
    }
  }
  throw new PersistenceError('CONFLICT', 'The data changed while the operation was in progress. Please try again.')
}

function categorySnapshotGuard(count: number): BatchStatement {
  return count === 0
    ? {
        sql: `UPDATE categories SET position = position
              WHERE (SELECT COUNT(*) FROM categories) <> 0`,
        expectedRowsAffected: 0,
      }
    : {
        sql: `UPDATE categories SET position = position
              WHERE (SELECT COUNT(*) FROM categories) = ?`,
        parameters: [count],
        expectedRowsAffected: count,
      }
}

function taskSnapshotGuard(categoryId: string, count: number): BatchStatement {
  return count === 0
    ? {
        sql: `UPDATE tasks SET position = position
              WHERE category_id = ?
                AND (SELECT COUNT(*) FROM tasks WHERE category_id = ?) <> 0`,
        parameters: [categoryId, categoryId],
        expectedRowsAffected: 0,
      }
    : {
        sql: `UPDATE tasks SET position = position
              WHERE category_id = ?
                AND (SELECT COUNT(*) FROM tasks WHERE category_id = ?) = ?`,
        parameters: [categoryId, categoryId, count],
        expectedRowsAffected: count,
      }
}

function categoryPositionStatements(categories: readonly Category[]): BatchStatement[] {
  return [
    ...categories.map((category, position) => ({
      sql: 'UPDATE categories SET position = ? WHERE id = ? AND position = ?',
      parameters: [-position - 1, category.id, category.order],
      expectedRowsAffected: 1,
    })),
    ...categories.map((category, position) => ({
      sql: 'UPDATE categories SET position = ? WHERE id = ? AND position = ?',
      parameters: [position, category.id, -position - 1],
      expectedRowsAffected: 1,
    })),
  ]
}

function taskPositionStatements(tasks: readonly Task[], categoryId: string): BatchStatement[] {
  return [
    ...tasks.map((task, position) => ({
      sql: `UPDATE tasks SET position = ?
            WHERE id = ? AND category_id = ? AND position = ?`,
      parameters: [-position - 1, task.id, categoryId, task.order],
      expectedRowsAffected: 1,
    })),
    ...tasks.map((task, position) => ({
      sql: `UPDATE tasks SET position = ?
            WHERE id = ? AND category_id = ? AND position = ?`,
      parameters: [position, task.id, categoryId, -position - 1],
      expectedRowsAffected: 1,
    })),
  ]
}

export function createSqliteRepository(driver: PersistenceDriver): Repository {
  const repository = createStubRepository()

  repository.createCategory = async ({ name }) => {
    validateName(name)
    const id = crypto.randomUUID()
    await withSqliteErrorMapping(() =>
      driver.execute(
        `INSERT INTO categories (id, name, position)
         SELECT ?, ?, COALESCE(MAX(position) + 1, 0) FROM categories`,
        [id, name],
      ),
    )
    const category = await repository.getCategory(id)
    if (category === undefined) throw new PersistenceError('NOT_FOUND')
    return category
  }

  repository.getCategory = async (id) => {
    const [row] = await driver.select<CategoryRow>(
      'SELECT id, name, position FROM categories WHERE id = ?',
      [id],
    )
    return row === undefined ? undefined : categoryFromRow(row)
  }

  repository.listCategories = async () => selectCategories(driver)

  repository.updateCategory = async (id, { name }) => {
    validateName(name)
    const result = await withSqliteErrorMapping(() =>
      driver.execute('UPDATE categories SET name = ? WHERE id = ?', [name, id]),
    )
    if (result.rowsAffected === 0) throw new PersistenceError('NOT_FOUND')
    const category = await repository.getCategory(id)
    if (category === undefined) throw new PersistenceError('NOT_FOUND')
    return category
  }

  repository.deleteCategory = async (id) => {
    await withStaleReadRetry(async () => {
      const categories = await selectCategories(driver)
      const category = categories.find((item) => item.id === id)
      if (category === undefined) throw new PersistenceError('NOT_FOUND')
      const survivors = categories.filter((item) => item.id !== id)
      try {
        await driver.batch([
          categorySnapshotGuard(categories.length),
          {
            sql: 'DELETE FROM categories WHERE id = ? AND position = ?',
            parameters: [id, category.order],
            expectedRowsAffected: 1,
          },
          ...categoryPositionStatements(survivors),
        ])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('FOREIGN KEY constraint failed') || message.includes('fk_tasks_category')) {
          throw new PersistenceError('CATEGORY_HAS_TASKS', 'CATEGORY_HAS_TASKS', { cause: error })
        }
        throw error
      }
    })
  }

  repository.reorderCategories = async (categoryIds) =>
    withStaleReadRetry(async () => {
      const current = await selectCategories(driver)
      const currentIds = new Set(current.map(({ id }) => id))
      const submittedIds = new Set(categoryIds)
      const isComplete =
        categoryIds.length === current.length &&
        submittedIds.size === categoryIds.length &&
        categoryIds.every((id) => currentIds.has(id))

      if (!isComplete) throw new PersistenceError('INVALID_REORDER')

      const byId = new Map(current.map((category) => [category.id, category]))
      const reordered = categoryIds.map((id) => byId.get(id) as Category)
      await driver.batch([
        categorySnapshotGuard(current.length),
        ...categoryPositionStatements(reordered),
      ])
      return reordered.map((category, order) => ({ ...category, order }))
    })

  repository.createTask = async ({ categoryId, title, description }) => {
    validateTitle(title)
    const id = crypto.randomUUID()
    const normalizedDescription = normalizeDescription(description)
    const result = await withSqliteErrorMapping(() =>
      driver.execute(
        `INSERT INTO tasks
          (id, category_id, title, description, position, status, completed_at)
         SELECT ?, ?, ?, ?, COALESCE(MAX(position) + 1, 0), 'active', NULL
         FROM tasks
         WHERE category_id = ?
         HAVING EXISTS (SELECT 1 FROM categories WHERE id = ?)`,
        [id, categoryId, title, normalizedDescription, categoryId, categoryId],
      ),
    )
    if (result.rowsAffected === 0) throw new PersistenceError('CATEGORY_NOT_FOUND')
    const task = await selectTask(driver, id)
    if (task === undefined) throw new PersistenceError('NOT_FOUND')
    return task
  }

  repository.getTask = async (id) => selectTask(driver, id)

  repository.listTasks = async (categoryId) => {
    if (!(await categoryExists(driver, categoryId))) {
      throw new PersistenceError('CATEGORY_NOT_FOUND')
    }
    return selectTasks(driver, categoryId)
  }

  repository.updateTask = async (id, { title, description }) => {
    validateTitle(title)
    const result = await withSqliteErrorMapping(() =>
      driver.execute(
        'UPDATE tasks SET title = ?, description = ? WHERE id = ?',
        [title, normalizeDescription(description), id],
      ),
    )
    if (result.rowsAffected === 0) throw new PersistenceError('NOT_FOUND')
    const task = await selectTask(driver, id)
    if (task === undefined) throw new PersistenceError('NOT_FOUND')
    return task
  }

  repository.deleteTask = async (id) => {
    await withStaleReadRetry(async () => {
      const task = await selectTask(driver, id)
      if (task === undefined) throw new PersistenceError('NOT_FOUND')
      const current = await selectTasks(driver, task.categoryId)
      const survivors = current.filter((item) => item.id !== id)
      await driver.batch([
        taskSnapshotGuard(task.categoryId, current.length),
        {
          sql: `DELETE FROM tasks
                WHERE id = ? AND category_id = ? AND position = ?`,
          parameters: [id, task.categoryId, task.order],
          expectedRowsAffected: 1,
        },
        ...taskPositionStatements(survivors, task.categoryId),
      ])
    })
  }

  repository.moveTask = async (taskId, targetCategoryId) =>
    withStaleReadRetry(async () => {
      const task = await selectTask(driver, taskId)
      if (task === undefined) throw new PersistenceError('NOT_FOUND')
      if (!(await categoryExists(driver, targetCategoryId))) {
        throw new PersistenceError('CATEGORY_NOT_FOUND')
      }
      if (task.categoryId === targetCategoryId) {
        throw new PersistenceError('INVALID_INPUT')
      }

      const current = await selectTasks(driver, task.categoryId)
      const survivors = current.filter((item) => item.id !== taskId)
      await withSqliteErrorMapping(() =>
        driver.batch([
          taskSnapshotGuard(task.categoryId, current.length),
          {
            sql: 'UPDATE categories SET name = name WHERE id = ?',
            parameters: [targetCategoryId],
            expectedRowsAffected: 1,
          },
          {
            sql: `UPDATE tasks
                  SET category_id = ?,
                      position = (SELECT COALESCE(MAX(position) + 1, 0) FROM tasks WHERE category_id = ?)
                  WHERE id = ? AND category_id = ? AND position = ?`,
            parameters: [targetCategoryId, targetCategoryId, taskId, task.categoryId, task.order],
            expectedRowsAffected: 1,
          },
          ...taskPositionStatements(survivors, task.categoryId),
        ]),
      )
      const moved = await selectTask(driver, taskId)
      if (moved === undefined) throw new PersistenceError('NOT_FOUND')
      return moved
    })

  repository.reorderTasks = async (categoryId, taskIds) =>
    withStaleReadRetry(async () => {
      if (!(await categoryExists(driver, categoryId))) {
        throw new PersistenceError('CATEGORY_NOT_FOUND')
      }
      const current = await selectTasks(driver, categoryId)
      const currentIds = new Set(current.map(({ id }) => id))
      const submittedIds = new Set(taskIds)
      const isComplete =
        taskIds.length === current.length &&
        submittedIds.size === taskIds.length &&
        taskIds.every((id) => currentIds.has(id))

      if (!isComplete) throw new PersistenceError('INVALID_REORDER')

      const byId = new Map(current.map((task) => [task.id, task]))
      const reordered = taskIds.map((id) => byId.get(id) as Task)
      await driver.batch([
        taskSnapshotGuard(categoryId, current.length),
        ...taskPositionStatements(reordered, categoryId),
      ])
      return reordered.map((task, order) => ({ ...task, order }))
    })

  repository.completeTask = async (taskId, completedAt) => {
    const result = await withSqliteErrorMapping(() =>
      driver.execute(
        `UPDATE tasks
         SET status = 'completed', completed_at = ?
         WHERE id = ? AND status = 'active'`,
        [completedAt.toISOString(), taskId],
      ),
    )
    if (result.rowsAffected === 0) {
      if ((await selectTask(driver, taskId)) === undefined) {
        throw new PersistenceError('NOT_FOUND')
      }
      throw new PersistenceError('INVALID_STATUS')
    }
    const task = await selectTask(driver, taskId)
    if (task === undefined) throw new PersistenceError('NOT_FOUND')
    return task
  }

  repository.reactivateTask = async (taskId) => {
    const result = await withSqliteErrorMapping(() =>
      driver.execute(
        `UPDATE tasks
         SET status = 'active', completed_at = NULL
         WHERE id = ? AND status = 'completed'`,
        [taskId],
      ),
    )
    if (result.rowsAffected === 0) {
      if ((await selectTask(driver, taskId)) === undefined) {
        throw new PersistenceError('NOT_FOUND')
      }
      throw new PersistenceError('INVALID_STATUS')
    }
    const task = await selectTask(driver, taskId)
    if (task === undefined) throw new PersistenceError('NOT_FOUND')
    return task
  }

  repository.purgeExpiredCompletedTasks = async (now) => {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    return withStaleReadRetry(async () => {
      const expired = await driver.select<TaskRow>(
        `SELECT id, category_id, title, description, position, status, completed_at
         FROM tasks
         WHERE status = 'completed' AND completed_at <= ?`,
        [cutoff],
      )
      if (expired.length === 0) return 0

      const affectedCategories = new Set(expired.map(({ category_id }) => category_id))
      const snapshots = new Map<string, Task[]>()
      for (const categoryId of affectedCategories) {
        snapshots.set(categoryId, await selectTasks(driver, categoryId))
      }
      const expiredIds = new Set(expired.map(({ id }) => id))
      const statements: BatchStatement[] = [
        {
          sql: `UPDATE tasks SET status = status
                WHERE status = 'completed' AND completed_at <= ?`,
          parameters: [cutoff],
          expectedRowsAffected: expired.length,
        },
      ]
      for (const [categoryId, tasks] of snapshots) {
        statements.push(taskSnapshotGuard(categoryId, tasks.length))
      }
      for (const row of expired) {
        statements.push({
          sql: `DELETE FROM tasks
                WHERE id = ? AND category_id = ? AND position = ?
                  AND status = 'completed' AND completed_at = ? AND completed_at <= ?`,
          parameters: [row.id, row.category_id, row.position, row.completed_at, cutoff],
          expectedRowsAffected: 1,
        })
      }
      for (const [categoryId, tasks] of snapshots) {
        statements.push(
          ...taskPositionStatements(
            tasks.filter((task) => !expiredIds.has(task.id)),
            categoryId,
          ),
        )
      }
      await driver.batch(statements)
      return expired.length
    })
  }

  return repository
}
