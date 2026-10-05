import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** AD-04 must match the wireframe sa-settings.png (Thresholds) and prototype/screens/ad-settings.html. */

const open = (query = '') => renderApp(`/ad/settings${query}`, { userId: 'u-yusuf' })
const field = (name: RegExp | string) => screen.getByRole('textbox', { name })
const bar = () => within(document.querySelector('.action-bar') as HTMLElement)

describe('AD-04 Settings', () => {
  it('shows the boundary editor with the derived Normal range', async () => {
    open()
    expect(await screen.findByText('Last updated 2 Sep 2026 by Yusuf Rahman')).toBeInTheDocument()
    const doRow = (await screen.findByText('≥ 5.0')).closest('tr')!
    expect(within(doRow).getAllByText('Not used')).toHaveLength(3) // DO has no high side
    expect(screen.getByText('7.5 – 8.5')).toBeInTheDocument()
    expect(screen.getByText('≤ 1.0')).toBeInTheDocument() // TAN, high only
    expect(field('TDS Critical (low)')).toHaveValue('')
    expect(field('TDS Warning (low)')).toHaveValue('15,000')
    expect(bar().getByText('No unsaved changes')).toBeInTheDocument()
    expect(bar().getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('shows an order error on the field and blocks saving', async () => {
    open()
    const warning = await screen.findByRole('textbox', { name: 'pH Warning (high)' })
    await userEvent.clear(warning)
    await userEvent.type(warning, '8.4')
    expect(warning).toHaveClass('is-error')
    expect(screen.getByText('Warning (8.4) must be above Attention (8.5).')).toBeInTheDocument()
    expect(bar().getByText('1 unsaved change')).toBeInTheDocument()
    expect(bar().getByText('pH high side · 1 error to fix')).toBeInTheDocument()
    expect(bar().getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await userEvent.click(bar().getByRole('button', { name: 'Discard changes' }))
    expect(warning).toHaveValue('8.7')
  })

  it('confirms where new default thresholds apply, then saves', async () => {
    open()
    const attention = await screen.findByRole('textbox', { name: 'DO Attention (low)' })
    await userEvent.clear(attention)
    await userEvent.type(attention, '5.2')
    expect(screen.getByText('≥ 5.2')).toBeInTheDocument()
    await userEvent.click(bar().getByRole('button', { name: 'Save changes' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Save thresholds?' }))
    expect(dialog.getByText(/all Farms that use the default \(Farm A, Farm B, Farm C, Farm E\)\. Farm D keeps its DO override\./)).toBeInTheDocument()
    expect(dialog.getByText('Not changed')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Thresholds saved')).toBeInTheDocument()
    expect(await screen.findByText('Last updated 29 Sep 2026 by Yusuf Rahman')).toBeInTheDocument()
  })

  it('edits a Farm override and returns a parameter to the default', async () => {
    open('?tab=thresholds&farm=farm-d')
    expect(await screen.findByDisplayValue('Farm D (1 override)')).toBe(screen.getByRole('combobox', { name: 'Apply to' }))
    expect(await screen.findByText('≥ 4.5')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use the default' }))
    expect(screen.getByText('≥ 5.0')).toBeInTheDocument()
    await userEvent.click(bar().getByRole('button', { name: 'Save changes' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Save thresholds?' }))
    expect(dialog.getByText(/apply to Farm D only/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('option', { name: 'Farm D (uses default)' })).toBeInTheDocument()
  })

  it('edits the growth curve: points must increase', async () => {
    open('?tab=growth')
    const abw = await screen.findByRole('textbox', { name: 'Target ABW of point 3' })
    await userEvent.clear(abw)
    await userEvent.type(abw, '7.0')
    expect(screen.getByText('Must be above 7.4 g.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.clear(abw)
    await userEvent.type(abw, '9.8')

    await userEvent.click(screen.getByRole('button', { name: 'Add point' }))
    expect(field('DOC of point 9')).toHaveValue('83')
    await userEvent.type(field('Target ABW of point 9'), '19.6')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Save growth targets?' })).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Growth targets saved')).toBeInTheDocument()
  })

  it('checks the rules against each other', async () => {
    open('?tab=rules')
    const offline = await screen.findByRole('textbox', { name: /Offline after/ })
    await userEvent.clear(offline)
    await userEvent.type(offline, '10')
    expect(screen.getByText('Must be longer than “Delayed after” (15 min).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.clear(offline)
    await userEvent.type(offline, '45')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Save rules?' })).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Rules saved')).toBeInTheDocument()
  })
})
