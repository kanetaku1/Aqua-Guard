import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { createQueryClient } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { setSession } from '@/mocks/http'

/** Render the whole app at `path`, optionally signed in as a mock user (see mocks/data.ts). */
export function renderApp(path: string, { userId }: { userId?: string } = {}) {
  if (userId) setSession(userId)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router }
}
