import type { Category, Task } from '../domain'

export interface CreateCategoryInput {
  readonly name: string
}

export interface UpdateCategoryInput {
  readonly name: string
}

export interface CreateTaskInput {
  readonly categoryId: string
  readonly title: string
  readonly description?: string
}

export interface UpdateTaskInput {
  readonly title: string
  readonly description?: string
}

export interface CategoryRepository {
  createCategory(input: CreateCategoryInput): Promise<Category>
  getCategory(id: string): Promise<Category | undefined>
  listCategories(): Promise<Category[]>
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category>
  deleteCategory(id: string): Promise<void>
  reorderCategories(categoryIds: readonly string[]): Promise<Category[]>
}

export interface TaskRepository {
  createTask(input: CreateTaskInput): Promise<Task>
  getTask(id: string): Promise<Task | undefined>
  listTasks(categoryId: string): Promise<Task[]>
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>
  deleteTask(id: string): Promise<void>
  moveTask(taskId: string, targetCategoryId: string): Promise<Task>
  reorderTasks(categoryId: string, taskIds: readonly string[]): Promise<Task[]>
  completeTask(taskId: string, completedAt: Date): Promise<Task>
  reactivateTask(taskId: string): Promise<Task>
  purgeExpiredCompletedTasks(now: Date): Promise<number>
}

export interface Repository extends CategoryRepository, TaskRepository {}

function notImplemented(): never {
  throw new Error('not implemented')
}

export function createStubRepository(): Repository {
  return {
    async createCategory() { return notImplemented() },
    async getCategory() { return notImplemented() },
    async listCategories() { return notImplemented() },
    async updateCategory() { return notImplemented() },
    async deleteCategory() { return notImplemented() },
    async reorderCategories() { return notImplemented() },
    async createTask() { return notImplemented() },
    async getTask() { return notImplemented() },
    async listTasks() { return notImplemented() },
    async updateTask() { return notImplemented() },
    async deleteTask() { return notImplemented() },
    async moveTask() { return notImplemented() },
    async reorderTasks() { return notImplemented() },
    async completeTask() { return notImplemented() },
    async reactivateTask() { return notImplemented() },
    async purgeExpiredCompletedTasks() { return notImplemented() },
  }
}
