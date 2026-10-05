import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertStateText, StatusMark } from './StatusMark'

describe('StatusMark (Badge vs Indicator, 07 §8.2)', () => {
  it('shows Normal as a Status Indicator', () => {
    render(<StatusMark severity="normal" />)
    const el = screen.getByText('Normal')
    expect(el).toHaveClass('status-text', 'st--normal')
    expect(el).not.toHaveClass('badge')
  })

  it.each(['attention', 'warning', 'critical'] as const)('shows %s as a Status Badge', (severity) => {
    const { container } = render(<StatusMark severity={severity} />)
    expect(container.firstChild).toHaveClass('badge', `badge--${severity}`)
  })

  it('prefixes alert states with a count', () => {
    render(<AlertStateText state="unacknowledged" count={1} />)
    expect(screen.getByText('1 Unacknowledged')).toHaveClass('status-text', 'st--unack')
  })
})
