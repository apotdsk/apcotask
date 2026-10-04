import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKLOG_CHANGED_EVENT,
  emitBacklogChanged,
  listenBacklogChanged,
} from './events'

const { emitMock, listenMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: emitMock,
  listen: listenMock,
}))

describe('backlog-changed events', () => {
  beforeEach(() => {
    emitMock.mockReset()
    listenMock.mockReset()
  })

  it('emits backlog-changed without a payload', async () => {
    emitMock.mockResolvedValue(undefined)

    await emitBacklogChanged()

    expect(emitMock).toHaveBeenCalledWith(BACKLOG_CHANGED_EVENT)
  })

  it('listens for backlog-changed', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const handler = vi.fn()

    await listenBacklogChanged(handler)

    expect(listenMock).toHaveBeenCalledWith(BACKLOG_CHANGED_EVENT, handler)
  })

  it('passes through the listener callback', async () => {
    listenMock.mockImplementation(
      (_event: string, handler: () => void) => {
        handler()
        return Promise.resolve(vi.fn())
      },
    )
    const handler = vi.fn()

    await listenBacklogChanged(handler)

    expect(handler).toHaveBeenCalledOnce()
  })

  it('returns the unlisten function', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)

    await expect(listenBacklogChanged(vi.fn())).resolves.toBe(unlisten)
  })
})
