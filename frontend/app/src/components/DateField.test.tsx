import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DateField } from './DateField'

function Harness({ allowFuture }: { allowFuture?: boolean }) {
  const [value, setValue] = useState('2026-09-20')
  return <DateField value={value} onChange={setValue} allowFuture={allowFuture} />
}

// Mock "today" = 29 Sep 2026 (VITE_MOCK_NOW)
describe('DateField (08 §09)', () => {
  it('picks a date from the calendar and shows it as "D MMM YYYY"', async () => {
    render(<Harness />)
    expect(screen.getByDisplayValue('20 Sep 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '29 Sep 2026' })).toHaveClass('is-today')
    expect(screen.getByRole('button', { name: '20 Sep 2026' })).toHaveClass('is-selected')
    await userEvent.click(screen.getByRole('button', { name: '25 Sep 2026' }))
    expect(screen.getByDisplayValue('25 Sep 2026')).toBeInTheDocument()
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument()
  })

  it('disables future dates unless allowed', async () => {
    const { unmount } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getByRole('button', { name: '30 Sep 2026' })).toBeDisabled()
    unmount()

    render(<Harness allowFuture />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await userEvent.click(screen.getByRole('button', { name: '5 Oct 2026' }))
    expect(screen.getByDisplayValue('5 Oct 2026')).toBeInTheDocument()
  })
})
