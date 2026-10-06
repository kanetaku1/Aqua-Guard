import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

describe('Role guard and sign-in (SCR-COM-001/002, AU-01)', () => {
  it('sends a user without a session to Login and back afterwards', async () => {
    const { router } = renderApp('/tm/ponds')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Ftm%2Fponds')

    await userEvent.type(await screen.findByLabelText(/Email/), 'sari.wijaya@nusantarashrimp.co.id')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tm/ponds'))
  })

  it("redirects to the user's own home when opening another Role's screen", async () => {
    const { router } = renderApp('/tm/dashboard', { userId: 'u-hendra' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/fm/dashboard'))
  })

  it('sends each Role to its first screen from /', async () => {
    const { router } = renderApp('/', { userId: 'u-yusuf' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/ad/users'))
  })

  it('shows remaining attempts, then locks after 5 failures', async () => {
    renderApp('/login')
    await userEvent.type(screen.getByLabelText(/Email/), 'sari.wijaya@nusantarashrimp.co.id')
    const password = screen.getByLabelText(/^Password/)
    const signIn = screen.getByRole('button', { name: 'Sign in' })

    await userEvent.type(password, 'wrong-password')
    await userEvent.click(signIn)
    expect(await screen.findByText('4 attempts left')).toBeInTheDocument()
    expect(password).toHaveClass('is-error')

    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(signIn).toBeEnabled())
      await userEvent.click(signIn)
    }
    expect(await screen.findByText(/locked for 15 minutes after 5 failed attempts/)).toBeInTheDocument()
    expect(signIn).toBeDisabled()
  })
})
