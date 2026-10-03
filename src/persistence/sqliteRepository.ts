import type { Category, Task, TaskStatus } from '../domain'
import type { PersistenceDriver } from './driver'
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

async function reindexTasks(driver: PersistenceDriver, categoryId: string): Promise<void> {
  const tasks = await selectTasks(driver, categoryId)
  for (let position = 0; position < tasks.length; position += 1) {
    await driver.execute('UPDATE tasks SET position = ? WHERE id = ?', [
      -position - 1,
      tasks[position].id,
    ])
  }
  for (let position = 0; position < tasks.length; position += 1) {
    await driver.execute('UPDATE tasks SET position = ? WHERE id = ?', [
      position,
      tasks[position].id,
    ])
  }
}

export function createSqliteRepository(driver: PersistenceDriver): Repository {
  const repository = createStubRepository()

  repository.createCategory = async ({ name }) => {
    validateName(name)
    const id = crypto.randomUUID()
    const [{ position }] = await driver.select<{ position: number }>(
      'SELECT COALESCE(MAX(position) + 1, 0) AS position FROM categories',
    )
    await withSqliteErrorMapping(() =>
      driver.execute(
        'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
        [id, name, position],
      ),
    )
    return { id, name, order: position }
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
    await driver.transaction(async (transaction) => {
      const [category] = await transaction.select<{ position: number }>(
        'SELECT position FROM categories WHERE id = ?',
        [id],
      )
      if (category === undefined) throw new PersistenceError('NOT_FOUND')

      try {
        await transaction.execute('DELETE FROM categories WHERE id = ?', [id])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('FOREIGN KEY constraint failed') || message.includes('fk_tasks_category')) {
          throw new PersistenceError('CATEGORY_HAS_TASKS', 'CATEGORY_HAS_TASKS', { cause: error })
        }
        throw error
      }

      await transaction.execute(
        'UPDATE categories SET position = position - 1 WHERE position > ?',
        [category.position],
      )
    })
  }

  repository.reorderCategories = async (categoryIds) =>
    driver.transaction(async (transaction) => {
      const current = await selectCategories(transaction)
      const currentIds = new Set(current.map(({ id }) => id))
      const submittedIds = new Set(categoryIds)
      const isComplete =
        categoryIds.length === current.length &&
        submittedIds.size === categoryIds.length &&
        categoryIds.every((id) => currentIds.has(id))

      if (!isComplete) throw new PersistenceError('INVALID_REORDER')

      for (let position = 0; position < categoryIds.length; position += 1) {
        await transaction.execute(
          'UPDATE categories SET position = ? WHERE id = ?',
          [-position - 1, categoryIds[position]],
        )
      }
      for (let position = 0; position < categoryIds.length; position += 1) {
        await transaction.execute(
          'UPDATE categories SET position = ? WHERE id = ?',
          [position, categoryIds[position]],
        )
      }

      return selectCategories(transaction)
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
    await driver.transaction(async (transaction) => {
      const task = await selectTask(transaction, id)
      if (task === undefined) throw new PersistenceError('NOT_FOUND')
      await transaction.execute('DELETE FROM tasks WHERE id = ?', [id])
      await reindexTasks(transaction, task.categoryId)
    })
  }

  repository.moveTask = async (taskId, targetCategoryId) =>
    driver.transaction(async (transaction) => {
      const task = await selectTask(transaction, taskId)
      if (task === undefined) throw new PersistenceError('NOT_FOUND')
      if (!(await categoryExists(transaction, targetCategoryId))) {
        throw new PersistenceError('CATEGORY_NOT_FOUND')
      }
      if (task.categoryId === targetCategoryId) {
        throw new PersistenceError('INVALID_INPUT')
      }

      await withSqliteErrorMapping(() =>
        transaction.execute(
          `UPDATE tasks
           SET category_id = ?,
               position = (SELECT COALESCE(MAX(position) + 1, 0) FROM tasks WHERE category_id = ?)
           WHERE id = ?`,
          [targetCategoryId, targetCategoryId, taskId],
        ),
      )
      await reindexTasks(transaction, task.categoryId)
      const moved = await selectTask(transaction, taskId)
      if (moved === undefined) throw new PersistenceError('NOT_FOUND')
      return moved
    })

  repository.reorderTasks = async (categoryId, taskIds) =>
    driver.transaction(async (transaction) => {
      if (!(await categoryExists(transaction, categoryId))) {
        throw new PersistenceError('CATEGORY_NOT_FOUND')
      }
      const current = await selectTasks(transaction, categoryId)
      const currentIds = new Set(current.map(({ id }) => id))
      const submittedIds = new Set(taskIds)
      const isComplete =
        taskIds.length === current.length &&
        submittedIds.size === taskIds.length &&
        taskIds.every((id) => currentIds.has(id))

      if (!isComplete) throw new PersistenceError('INVALID_REORDER')

      for (let position = 0; position < taskIds.length; position += 1) {
        await transaction.execute('UPDATE tasks SET position = ? WHERE id = ?', [
          -position - 1,
          taskIds[position],
        ])
      }
      for (let position = 0; position < taskIds.length; position += 1) {
        await transaction.execute('UPDATE tasks SET position = ? WHERE id = ?', [
          position,
          taskIds[position],
        ])
      }

      return selectTasks(transaction, categoryId)
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
    return driver.transaction(async (transaction) => {
      const expired = await transaction.select<{ category_id: string }>(
        `SELECT category_id
         FROM tasks
         WHERE status = 'completed' AND completed_at <= ?`,
        [cutoff],
      )
      if (expired.length === 0) return 0

      const result = await transaction.execute(
        `DELETE FROM tasks
         WHERE status = 'completed' AND completed_at <= ?`,
        [cutoff],
      )
      const affectedCategories = new Set(expired.map(({ category_id }) => category_id))
      for (const categoryId of affectedCategories) {
        await reindexTasks(transaction, categoryId)
      }
      return result.rowsAffected
    })
  }

  return repository
}
