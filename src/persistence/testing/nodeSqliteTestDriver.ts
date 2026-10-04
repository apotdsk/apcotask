import { readFile } from 'node:fs/promises'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { RepositoryContractHarness } from '../contract'
import type {
  BatchStatement,
  ExecuteResult,
  PersistenceDriver,
  SqlParameters,
} from '../driver'
import { BatchExpectationError } from '../driver'
import { createSqliteRepository } from '../sqliteRepository'

const migrationUrl = new URL('../../../src-tauri/migrations/0001_initial.sql', import.meta.url)

function nodeParameters(parameters: SqlParameters): SQLInputValue[] {
  return parameters.map((value) => value) as SQLInputValue[]
}

class NodeSqliteTestDriver implements PersistenceDriver {
  private readonly database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.database = database
  }

  async select<Row extends object>(sql: string, parameters: SqlParameters = []): Promise<Row[]> {
    return this.database.prepare(sql).all(...nodeParameters(parameters)) as Row[]
  }

  async execute(sql: string, parameters: SqlParameters = []): Promise<ExecuteResult> {
    const result = this.database.prepare(sql).run(...nodeParameters(parameters))
    return { rowsAffected: Number(result.changes) }
  }

  async batch(statements: readonly BatchStatement[]): Promise<readonly ExecuteResult[]> {
    this.database.exec('BEGIN')
    try {
      const results = statements.map((statement, index) => {
        const result = this.database
          .prepare(statement.sql)
          .run(...nodeParameters(statement.parameters ?? []))
        const rowsAffected = Number(result.changes)
        if (
          statement.expectedRowsAffected !== undefined &&
          rowsAffected !== statement.expectedRowsAffected
        ) {
          throw new BatchExpectationError(
            index,
            statement.expectedRowsAffected,
            rowsAffected,
          )
        }
        return { rowsAffected }
      })
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  executeScript(sql: string): void {
    this.database.exec(sql)
  }

  close(): void {
    this.database.close()
  }
}

export interface NodeSqliteTestDatabase {
  readonly driver: PersistenceDriver
  close(): void
}

export async function createNodeSqliteTestDatabase(): Promise<NodeSqliteTestDatabase> {
  const database = new DatabaseSync(':memory:')
  const driver = new NodeSqliteTestDriver(database)
  driver.executeScript('PRAGMA foreign_keys = ON')
  driver.executeScript(await readFile(migrationUrl, 'utf8'))
  return { driver, close: () => driver.close() }
}

export function createNodeSqliteTestHarness(): RepositoryContractHarness {
  const databases: NodeSqliteTestDatabase[] = []
  return {
    async createRepository() {
      const database = await createNodeSqliteTestDatabase()
      databases.push(database)
      return createSqliteRepository(database.driver)
    },
    async dispose() {
      for (const database of databases) database.close()
      databases.length = 0
    },
  }
}
