import type { SalesData, UserRef } from '../types/sales'
import type { SalesService } from './salesService'
import { buildMockData } from './mockData'

/**
 * Demo implementation: serves the seeded in-memory dataset. The full set of
 * GVL is already in memory, so a GVL selection does not re-query — the views
 * filter client-side via `ctx.userId`. The artificial delay only runs on the
 * first build so switching GVL stays snappy (no spinner flicker).
 */
class MockSalesService implements SalesService {
  private snapshot: SalesData | null = null

  async load(): Promise<SalesData> {
    if (!this.snapshot) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      this.snapshot = buildMockData()
    }
    return this.snapshot
  }

  async listSalesManagers(): Promise<UserRef[]> {
    this.snapshot ??= buildMockData()
    return this.snapshot.salesManagers
  }
}

export const mockSalesService = new MockSalesService()
