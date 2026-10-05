import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { Drawer } from './Drawer'

describe('Drawer', () => {
  it('keeps focus in the field being typed in when the parent re-renders (e.g. after an autosave)', async () => {
    const view = (onClose: () => void) => (
      <Drawer title="Pond 02" onClose={onClose}>
        <textarea aria-label="Note" />
      </Drawer>
    )
    const { rerender } = render(view(() => {}))
    const note = screen.getByRole('textbox', { name: 'Note' })
    await userEvent.type(note, 'Shrimp near the surface')
    expect(note).toHaveFocus()

    const onClose = vi.fn()
    rerender(view(onClose)) // a new onClose on every parent render
    expect(note).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce() // Esc uses the latest onClose
  })
})
