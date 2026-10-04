import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchExpectationError } from './driver'
import { mapSqliteError } from './errorMapping'
import { createTauriPersistenceDriver } from './tauriDriver'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

describe('Tauri persistence driver', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('invokes select with the command arguments', async () => {
    invokeMock.mockResolvedValue([{ id: 'category' }])
    const driver = createTauriPersistenceDriver()

    await expect(driver.select('SELECT id FROM categories WHERE id = ?', ['category']))
      .resolves.toEqual([{ id: 'category' }])
    expect(invokeMock).toHaveBeenCalledWith('select', {
      sql: 'SELECT id FROM categories WHERE id = ?',
      parameters: ['category'],
    })
  })

  it('invokes execute and normalizes rowsAffected', async () => {
    invokeMock.mockResolvedValue({ rowsAffected: '2' })
    const driver = createTauriPersistenceDriver()

    await expect(driver.execute('DELETE FROM tasks WHERE category_id = ?', ['category']))
      .resolves.toEqual({ rowsAffected: 2 })
    expect(invokeMock).toHaveBeenCalledWith('execute', {
      sql: 'DELETE FROM tasks WHERE category_id = ?',
      parameters: ['category'],
    })
  })

  it('invokes batch with statement arguments and normalizes results', async () => {
    invokeMock.mockResolvedValue([{ rowsAffected: '1' }, { rowsAffected: 0 }])
    const driver = createTauriPersistenceDriver()
    const statements = [
      {
        sql: 'UPDATE categories SET name = ? WHERE id = ?',
        parameters: ['Renamed', 'category'],
        expectedRowsAffected: 1,
      },
      { sql: 'DELETE FROM tasks WHERE id = ?', parameters: ['missing'] },
    ] as const

    await expect(driver.batch(statements)).resolves.toEqual([
      { rowsAffected: 1 },
      { rowsAffected: 0 },
    ])
    expect(invokeMock).toHaveBeenCalledWith('batch', { statements })
  })

  it('translates STALE_READ into BatchExpectationError with metadata', async () => {
    invokeMock.mockRejectedValue({
      code: 'STALE_READ',
      message: 'stale snapshot',
      statementIndex: 2,
      expectedRowsAffected: 1,
      actualRowsAffected: 0,
    })
    const driver = createTauriPersistenceDriver()

    const error = await driver.batch([]).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BatchExpectationError)
    expect(error).toMatchObject({
      statementIndex: 2,
      expectedRowsAffected: 1,
      actualRowsAffected: 0,
    })
  })

  it('preserves SQLite messages from other structured errors for constraint mapping', async () => {
    invokeMock.mockRejectedValue({
      code: 'DATABASE',
      message: 'CHECK constraint failed: ck_tasks_status',
    })
    const driver = createTauriPersistenceDriver()

    const error = await driver.execute('UPDATE tasks SET status = ?', ['invalid'])
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('CHECK constraint failed: ck_tasks_status')
    expect(mapSqliteError(error).code).toBe('INVALID_STATUS')
  })
})
