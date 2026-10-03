import type { Category } from '../domain'
import type { PersistenceDriver } from './driver'
import { PersistenceError } from './errors'
import { withSqliteErrorMapping } from './errorMapping'
import { createStubRepository, type Repository } from './repository'

interface CategoryRow {
  readonly id: string
  readonly name: string
  readonly position: number
}

function categoryFromRow(row: CategoryRow): Category {
  return { id: row.id, name: row.name, order: row.position }
}

function validateName(name: string): void {
  if (name.trim().length === 0) throw new PersistenceError('INVALID_INPUT')
}

async function selectCategories(driver: PersistenceDriver): Promise<Category[]> {
  const rows = await driver.select<CategoryRow>(
    'SELECT id, name, position FROM categories ORDER BY position',
  )
  return rows.map(categoryFromRow)
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

  return repository
}
