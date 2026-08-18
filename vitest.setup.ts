import { vi } from 'vitest'

// next/cache requires an active Next.js request/static-generation context.
// Server integration tests invoke domain functions directly, so only the
// framework side effect is replaced; the business logic remains real.
vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>()

  return {
    ...actual,
    revalidateTag: vi.fn(),
  }
})
