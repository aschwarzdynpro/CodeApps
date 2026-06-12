import type { SalesData } from '../types/sales'
import type { SalesService } from './salesService'
import { buildMockData } from './mockData'

/**
 * Demo implementation: serves the seeded in-memory dataset with a tiny
 * artificial delay so loading states are visible during development.
 */
class MockSalesService implements SalesService {
  private snapshot: SalesData | null = null

  async load(): Promise<SalesData> {
    await new Promise((resolve) => setTimeout(resolve, 350))
    // Build lazily but only once — repeated refreshes stay stable.
    this.snapshot ??= buildMockData()
    return this.snapshot
  }
}

export const mockSalesService = new MockSalesService()
