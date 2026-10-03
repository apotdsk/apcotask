import { afterEach, describe, expect, it } from 'vitest'
import type { PersistenceDriver } from './driver'
import type { PersistenceErrorCode } from './errors'
import { withSqliteErrorMapping } from './errorMapping'
import {
  createNodeSqliteTestDatabase,
  type NodeSqliteTestDatabase,
} from './testing/nodeSqliteTestDriver'

const databases: NodeSqliteTestDatabase[] = []

async function database(): Promise<NodeSqliteTestDatabase> {
  const result = await createNodeSqliteTestDatabase()
  databases.push(result)
  return result
}

async function expectMappedCode(
  operation: Promise<unknown>,
  code: PersistenceErrorCode,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ name: 'PersistenceError', code })
}

async function insertCategory(driver: PersistenceDriver): Promise<void> {
  await driver.execute(
    'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
    ['category', 'Category', 0],
  )
}

async function insertTask(
  driver: PersistenceDriver,
  title: string,
  status: string,
  completedAt: string | null,
): Promise<void> {
  await driver.execute(
    `INSERT INTO tasks
      (id, category_id, title, position, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['task', 'category', title, 0, status, completedAt],
  )
}

afterEach(() => {
  for (const item of databases) item.close()
  databases.length = 0
})

describe('shared SQLite schema and error mapping', () => {
  it('maps a duplicate category position to DUPLICATE_ORDER', async () => {
    const { driver } = await database()
    await insertCategory(driver)

    await expectMappedCode(
      withSqliteErrorMapping(() =>
        driver.execute(
          'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
          ['other', 'Other', 0],
        ),
      ),
      'DUPLICATE_ORDER',
    )
  })

  it.each([
    ['an empty category name', async (driver: PersistenceDriver) => {
      await driver.execute(
        'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
        ['category', '  ', 0],
      )
    }],
    ['an empty task title', async (driver: PersistenceDriver) => {
      await insertCategory(driver)
      await insertTask(driver, '   ', 'active', null)
    }],
  ])('maps %s constraint to INVALID_INPUT', async (_label, operation) => {
    const { driver } = await database()
    await expectMappedCode(
      withSqliteErrorMapping(() => operation(driver)),
      'INVALID_INPUT',
    )
  })

  it.each([
    ['an unknown status', 'paused', null],
    ['an active task with a completion time', 'active', '2026-01-01T00:00:00.000Z'],
    ['a completed task without a completion time', 'completed', null],
  ])('maps %s constraint to INVALID_STATUS', async (_label, status, completedAt) => {
    const { driver } = await database()
    await insertCategory(driver)
    await expectMappedCode(
      withSqliteErrorMapping(() => insertTask(driver, 'Task', status, completedAt)),
      'INVALID_STATUS',
    )
  })

  it('enables foreign-key enforcement on each test connection', async () => {
    const { driver } = await database()
    await expect(
      driver.execute(
        `INSERT INTO tasks
          (id, category_id, title, position, status, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['task', 'missing', 'Task', 0, 'active', null],
      ),
    ).rejects.toThrow('FOREIGN KEY constraint failed')
  })
})
