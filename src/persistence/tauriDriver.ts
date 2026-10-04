import { invoke } from '@tauri-apps/api/core'
import {
  BatchExpectationError,
  type BatchStatement,
  type ExecuteResult,
  type PersistenceDriver,
  type SqlParameters,
} from './driver'

interface StructuredDatabaseError {
  readonly code: string
  readonly message: string
  readonly statementIndex?: number
  readonly expectedRowsAffected?: number
  readonly actualRowsAffected?: number
}

function isStructuredDatabaseError(error: unknown): error is StructuredDatabaseError {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as Record<string, unknown>
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

function translateError(error: unknown): never {
  if (
    isStructuredDatabaseError(error) &&
    error.code === 'STALE_READ' &&
    typeof error.statementIndex === 'number' &&
    typeof error.expectedRowsAffected === 'number' &&
    typeof error.actualRowsAffected === 'number'
  ) {
    throw new BatchExpectationError(
      error.statementIndex,
      error.expectedRowsAffected,
      error.actualRowsAffected,
    )
  }
  if (isStructuredDatabaseError(error)) throw new Error(error.message)
  throw error
}

async function invokeDatabase<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    translateError(error)
  }
}

export function createTauriPersistenceDriver(): PersistenceDriver {
  return {
    select<Row extends object>(sql: string, parameters: SqlParameters = []) {
      return invokeDatabase<Row[]>('select', { sql, parameters })
    },
    async execute(sql: string, parameters: SqlParameters = []) {
      const result = await invokeDatabase<ExecuteResult>('execute', { sql, parameters })
      return { rowsAffected: Number(result.rowsAffected) }
    },
    async batch(statements: readonly BatchStatement[]) {
      const results = await invokeDatabase<readonly ExecuteResult[]>('batch', { statements })
      return results.map(({ rowsAffected }) => ({ rowsAffected: Number(rowsAffected) }))
    },
  }
}
