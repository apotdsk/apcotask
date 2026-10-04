import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'

export const BACKLOG_CHANGED_EVENT = 'backlog-changed'

export function emitBacklogChanged(): Promise<void> {
  return emit(BACKLOG_CHANGED_EVENT)
}

export function listenBacklogChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(BACKLOG_CHANGED_EVENT, handler)
}
