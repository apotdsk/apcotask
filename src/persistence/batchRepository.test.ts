import { afterEach, describe, expect, it } from 'vitest'
import type { Category, Task } from '../domain'
import {
  BatchExpectationError,
  type BatchStatement,
  type ExecuteResult,
  type PersistenceDriver,
  type SqlParameters,
} from './driver'
import { createSqliteRepository } from './sqliteRepository'
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

class InstrumentedDriver implements PersistenceDriver {
  batchCalls = 0
  selectCalls = 0
  readonly batches: BatchStatement[][] = []
  staleBatchesRemaining = 0
  beforeNextBatch?: () => Promise<void>

  private readonly inner: PersistenceDriver

  constructor(inner: PersistenceDriver) {
    this.inner = inner
  }

  async select<Row extends object>(sql: string, parameters?: SqlParameters): Promise<Row[]> {
    this.selectCalls += 1
    return this.inner.select<Row>(sql, parameters)
  }

  async execute(sql: string, parameters?: SqlParameters): Promise<ExecuteResult> {
    return this.inner.execute(sql, parameters)
  }

  async batch(statements: readonly BatchStatement[]): Promise<readonly ExecuteResult[]> {
    this.batchCalls += 1
    this.batches.push([...statements])
    if (this.beforeNextBatch !== undefined) {
      const operation = this.beforeNextBatch
      this.beforeNextBatch = undefined
      await operation()
    }
    if (this.staleBatchesRemaining > 0) {
      this.staleBatchesRemaining -= 1
      throw new BatchExpectationError(0, 1, 0)
    }
    return this.inner.batch(statements)
  }
}

afterEach(() => {
  for (const item of databases) item.close()
  databases.length = 0
})

describe('Node SQLite guarded batches', () => {
  it('commits every statement and returns each result', async () => {
    const { driver } = await database()
    const results = await driver.batch([
      {
        sql: 'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
        parameters: ['a', 'A', 0],
        expectedRowsAffected: 1,
      },
      {
        sql: 'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
        parameters: ['b', 'B', 1],
        expectedRowsAffected: 1,
      },
    ])

    expect(results).toEqual([{ rowsAffected: 1 }, { rowsAffected: 1 }])
    expect(await driver.select<{ id: string }>('SELECT id FROM categories ORDER BY position')).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
  })

  it('rolls back earlier statements when a later SQL statement fails', async () => {
    const { driver } = await database()
    await expect(
      driver.batch([
        {
          sql: 'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
          parameters: ['a', 'A', 0],
        },
        {
          sql: 'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
          parameters: ['b', 'B', 0],
        },
      ]),
    ).rejects.toThrow()
    expect(await driver.select('SELECT id FROM categories')).toEqual([])
  })

  it('rolls back earlier statements when an affected-row expectation fails', async () => {
    const { driver } = await database()
    await expect(
      driver.batch([
        {
          sql: 'INSERT INTO categories (id, name, position) VALUES (?, ?, ?)',
          parameters: ['a', 'A', 0],
          expectedRowsAffected: 1,
        },
        {
          sql: 'UPDATE categories SET name = ? WHERE id = ?',
          parameters: ['Missing', 'missing'],
          expectedRowsAffected: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(BatchExpectationError)
    expect(await driver.select('SELECT id FROM categories')).toEqual([])
  })
})

describe('repository guarded-batch retries', () => {
  it('rereads and succeeds on the third attempt after two stale batches', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const first = await repository.createCategory({ name: 'First' })
    const second = await repository.createCategory({ name: 'Second' })
    driver.staleBatchesRemaining = 2
    const readsBefore = driver.selectCalls

    expect(await repository.reorderCategories([second.id, first.id])).toEqual([
      { ...second, order: 0 },
      { ...first, order: 1 },
    ])
    expect(driver.batchCalls).toBe(3)
    expect(driver.selectCalls - readsBefore).toBe(3)
  })

  it('throws CONFLICT with a readable message after three stale batches', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const category = await repository.createCategory({ name: 'Category' })
    driver.staleBatchesRemaining = 3

    await expect(repository.reorderCategories([category.id])).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'CONFLICT',
      message: 'The data changed while the operation was in progress. Please try again.',
    })
    expect(driver.batchCalls).toBe(3)
  })

  it('rejects a stale category reorder after a real competing append', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const first = await repository.createCategory({ name: 'First' })
    const second = await repository.createCategory({ name: 'Second' })
    driver.beforeNextBatch = async () => {
      await base.execute(
        `INSERT INTO categories (id, name, position)
         SELECT ?, ?, COALESCE(MAX(position) + 1, 0) FROM categories`,
        ['competing', 'Competing'],
      )
    }

    await expect(repository.reorderCategories([second.id, first.id])).rejects.toMatchObject({
      code: 'INVALID_REORDER',
    })
    expect(driver.batchCalls).toBe(1)
    expect(await repository.listCategories()).toEqual([
      first,
      second,
      { id: 'competing', name: 'Competing', order: 2 },
    ])
  })

  it('retries task deletion after a real competing sibling deletion', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const competingRepository = createSqliteRepository(base)
    const category = await repository.createCategory({ name: 'Category' })
    const first = await repository.createTask({ categoryId: category.id, title: 'First' })
    const target = await repository.createTask({ categoryId: category.id, title: 'Target' })
    const sibling = await repository.createTask({ categoryId: category.id, title: 'Sibling' })
    driver.beforeNextBatch = async () => competingRepository.deleteTask(sibling.id)

    await repository.deleteTask(target.id)

    expect(driver.batchCalls).toBe(2)
    expect(await repository.listTasks(category.id)).toEqual([{ ...first, order: 0 }])
  })
})

describe('repository two-phase gap closing', () => {
  function expectTwoPhase(statements: readonly BatchStatement[], table: string): void {
    const positionWrites = statements.filter(
      ({ sql, parameters }) =>
        sql.includes(`UPDATE ${table} SET position = ?`) && typeof parameters?.[0] === 'number',
    )
    const assigned = positionWrites.map(({ parameters }) => parameters?.[0] as number)
    const firstFinal = assigned.findIndex((position) => position >= 0)
    expect(firstFinal).toBeGreaterThan(0)
    expect(assigned.slice(0, firstFinal).every((position) => position < 0)).toBe(true)
    expect(assigned.slice(firstFinal).every((position) => position >= 0)).toBe(true)
    expect(positionWrites.every(({ expectedRowsAffected }) => expectedRowsAffected === 1)).toBe(true)
    expect(statements.every(({ sql }) => !sql.includes('position = position - 1'))).toBe(true)
  }

  it('uses two phases when category deletion closes a gap', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    await repository.createCategory({ name: 'First' })
    const middle = await repository.createCategory({ name: 'Middle' })
    await repository.createCategory({ name: 'Last' })
    await repository.deleteCategory(middle.id)
    expectTwoPhase(driver.batches.at(-1) ?? [], 'categories')
  })

  it.each([
    ['task deletion', async (repository: ReturnType<typeof createSqliteRepository>, tasks: Task[]) => {
      await repository.deleteTask(tasks[1].id)
    }],
    ['task move', async (repository: ReturnType<typeof createSqliteRepository>, tasks: Task[]) => {
      const target = await repository.createCategory({ name: 'Target' })
      await repository.moveTask(tasks[1].id, target.id)
    }],
  ])('uses two phases when %s closes a gap', async (_label, operation) => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const category = await repository.createCategory({ name: 'Source' })
    const tasks: Task[] = []
    for (const title of ['First', 'Middle', 'Last']) {
      tasks.push(await repository.createTask({ categoryId: category.id, title }))
    }
    await operation(repository, tasks)
    expectTwoPhase(driver.batches.at(-1) ?? [], 'tasks')
  })

  it('uses two phases for every category compacted by purge', async () => {
    const { driver: base } = await database()
    const driver = new InstrumentedDriver(base)
    const repository = createSqliteRepository(driver)
    const categories: Category[] = []
    for (const name of ['First', 'Second']) categories.push(await repository.createCategory({ name }))
    for (const category of categories) {
      await repository.createTask({ categoryId: category.id, title: 'Keep' })
      const expired = await repository.createTask({ categoryId: category.id, title: 'Expired' })
      await repository.completeTask(expired.id, new Date('2026-01-01T00:00:00.000Z'))
    }

    await repository.purgeExpiredCompletedTasks(new Date('2026-01-02T00:00:00.000Z'))
    const statements = driver.batches.at(-1) ?? []
    for (const category of categories) {
      const categoryWrites = statements.filter(
        ({ sql, parameters }) =>
          sql.includes('UPDATE tasks SET position = ?') && parameters?.[2] === category.id,
      )
      expectTwoPhase(categoryWrites, 'tasks')
    }
  })
})
