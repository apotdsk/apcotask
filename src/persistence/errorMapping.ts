import { PersistenceError } from './errors'

const CONSTRAINT_CODES = [
  {
    code: 'DUPLICATE_ORDER',
    fragments: [
      'uq_categories_position',
      'categories.position',
      'uq_tasks_category_position',
      'tasks.category_id, tasks.position',
    ],
  },
  {
    code: 'INVALID_INPUT',
    fragments: ['ck_categories_name_nonempty', 'ck_tasks_title_nonempty'],
  },
  {
    code: 'INVALID_STATUS',
    fragments: ['ck_tasks_status', 'ck_tasks_completion_state'],
  },
] as const

export function mapSqliteError(error: unknown): PersistenceError {
  const message = error instanceof Error ? error.message : String(error)

  for (const mapping of CONSTRAINT_CODES) {
    if (mapping.fragments.some((fragment) => message.includes(fragment))) {
      return new PersistenceError(mapping.code, mapping.code, { cause: error })
    }
  }

  throw error
}

export async function withSqliteErrorMapping<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw mapSqliteError(error)
  }
}
