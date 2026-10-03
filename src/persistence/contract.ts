import type { Repository } from './repository'

export interface RepositoryContractHarness {
  createRepository(): Promise<Repository>
  dispose(): Promise<void>
}
