export interface Category {
  readonly id: string
  readonly name: string
  readonly order: number
}

export type TaskStatus = 'active' | 'completed'

export interface Task {
  readonly id: string
  readonly categoryId: string
  readonly title: string
  readonly description?: string
  readonly order: number
  readonly status: TaskStatus
  readonly completedAt?: string
}
