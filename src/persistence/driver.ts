export type SqlValue = string | number | bigint | Uint8Array | null
export type SqlParameters = readonly SqlValue[]

export interface ExecuteResult {
  readonly rowsAffected: number
}

export interface PersistenceDriver {
  select<Row extends object>(sql: string, parameters?: SqlParameters): Promise<Row[]>
  execute(sql: string, parameters?: SqlParameters): Promise<ExecuteResult>
  transaction<T>(operation: (driver: PersistenceDriver) => Promise<T>): Promise<T>
}
