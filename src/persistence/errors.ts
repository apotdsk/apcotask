export type PersistenceErrorCode =
  | 'DUPLICATE_ORDER'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_HAS_TASKS'
  | 'INVALID_STATUS'
  | 'INVALID_INPUT'
  | 'INVALID_REORDER'
  | 'NOT_FOUND'
  | 'CONFLICT'

export class PersistenceError extends Error {
  override readonly name = 'PersistenceError'
  readonly code: PersistenceErrorCode

  constructor(
    code: PersistenceErrorCode,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message ?? code, options)
    this.code = code
  }
}
