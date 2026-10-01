import { describe, expect, it } from 'vitest'
import type { Category, Task, TaskStatus } from './models'
import { buildActiveTaskSequence } from './taskSequence'

function category(id: string, order: number): Category {
  return { id, name: `Category ${id}`, order }
}

function task(
  id: string,
  categoryId: string,
  order: number,
  status: TaskStatus = 'active',
): Task {
  return { id, categoryId, title: id, order, status }
}

function taskIds(tasks: readonly Task[]): string[] {
  return tasks.map(({ id }) => id)
}

describe('buildActiveTaskSequence', () => {
  it('interleaves equal-sized categories in round-robin order', () => {
    const categories = [category('A', 0), category('B', 1), category('C', 2)]
    const tasks = [
      task('A1', 'A', 0),
      task('A2', 'A', 1),
      task('A3', 'A', 2),
      task('B1', 'B', 0),
      task('B2', 'B', 1),
      task('B3', 'B', 2),
      task('C1', 'C', 0),
      task('C2', 'C', 1),
      task('C3', 'C', 2),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'B1',
      'C1',
      'A2',
      'B2',
      'C2',
      'A3',
      'B3',
      'C3',
    ])
  })

  it('continues round-robin when categories have unequal task counts', () => {
    const categories = [category('A', 0), category('B', 1), category('C', 2)]
    const tasks = [
      task('A1', 'A', 0),
      task('A2', 'A', 1),
      task('A3', 'A', 2),
      task('B1', 'B', 0),
      task('C1', 'C', 0),
      task('C2', 'C', 1),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'B1',
      'C1',
      'A2',
      'C2',
      'A3',
    ])
  })

  it('skips categories with no tasks', () => {
    const categories = [category('A', 0), category('B', 1), category('C', 2)]
    const tasks = [task('A1', 'A', 0), task('C1', 'C', 0)]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'C1',
    ])
  })

  it('excludes completed tasks', () => {
    const categories = [category('A', 0), category('B', 1)]
    const tasks = [
      task('A1', 'A', 0, 'completed'),
      task('A2', 'A', 1),
      task('B1', 'B', 0),
      task('B2', 'B', 1, 'completed'),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A2',
      'B1',
    ])
  })

  it('returns tasks from one category in task order', () => {
    const categories = [category('A', 0)]
    const tasks = [
      task('A3', 'A', 2),
      task('A1', 'A', 0),
      task('A2', 'A', 1),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'A2',
      'A3',
    ])
  })

  it('returns an empty sequence when there are no active tasks', () => {
    const categories = [category('A', 0)]
    const tasks = [task('A1', 'A', 0, 'completed')]

    expect(buildActiveTaskSequence(categories, tasks)).toEqual([])
    expect(buildActiveTaskSequence([], [])).toEqual([])
  })

  it('uses category order instead of input order', () => {
    const categories = [category('C', 2), category('A', 0), category('B', 1)]
    const tasks = [
      task('C1', 'C', 0),
      task('A1', 'A', 0),
      task('B1', 'B', 0),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'B1',
      'C1',
    ])
  })

  it('uses task order within each category instead of input order', () => {
    const categories = [category('A', 0), category('B', 1)]
    const tasks = [
      task('A2', 'A', 1),
      task('B2', 'B', 1),
      task('A1', 'A', 0),
      task('B1', 'B', 0),
    ]

    expect(taskIds(buildActiveTaskSequence(categories, tasks))).toEqual([
      'A1',
      'B1',
      'A2',
      'B2',
    ])
  })
})
