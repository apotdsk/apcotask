import type { Category, Task } from './models'

export function buildActiveTaskSequence(
  categories: readonly Category[],
  tasks: readonly Task[],
): Task[] {
  const orderedCategories = [...categories].sort(
    (left, right) => left.order - right.order,
  )

  const tasksByCategory = new Map<string, Task[]>()

  for (const task of tasks) {
    if (task.status !== 'active') {
      continue
    }

    const categoryTasks = tasksByCategory.get(task.categoryId) ?? []
    categoryTasks.push(task)
    tasksByCategory.set(task.categoryId, categoryTasks)
  }

  for (const categoryTasks of tasksByCategory.values()) {
    categoryTasks.sort((left, right) => left.order - right.order)
  }

  const sequence: Task[] = []
  const largestCategorySize = Math.max(
    0,
    ...orderedCategories.map(
      (category) => tasksByCategory.get(category.id)?.length ?? 0,
    ),
  )

  for (let taskIndex = 0; taskIndex < largestCategorySize; taskIndex += 1) {
    for (const category of orderedCategories) {
      const task = tasksByCategory.get(category.id)?.[taskIndex]

      if (task) {
        sequence.push(task)
      }
    }
  }

  return sequence
}
