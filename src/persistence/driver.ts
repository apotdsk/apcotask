export type SqlValue = string | number | null
export type SqlParameters = readonly SqlValue[]

export interface ExecuteResult {
  readonly rowsAffected: number
}

export interface BatchStatement {
  readonly sql: string
  readonly parameters?: SqlParameters
  readonly expectedRowsAffected?: number
}

export class BatchExpectationError extends Error {
  override readonly name = 'BatchExpectationError'
  readonly statementIndex: number
  readonly expectedRowsAffected: number
  readonly actualRowsAffected: number

  constructor(
    statementIndex: number,
    expectedRowsAffected: number,
    actualRowsAffected: number,
  ) {
    super(
      `Batch statement ${statementIndex} affected ${actualRowsAffected} rows; expected ${expectedRowsAffected}`,
    )
    this.statementIndex = statementIndex
    this.expectedRowsAffected = expectedRowsAffected
    this.actualRowsAffected = actualRowsAffected
  }
}

export interface PersistenceDriver {
  select<Row extends object>(sql: string, parameters?: SqlParameters): Promise<Row[]>
  execute(sql: string, parameters?: SqlParameters): Promise<ExecuteResult>
  batch(statements: readonly BatchStatement[]): Promise<readonly ExecuteResult[]>
}
