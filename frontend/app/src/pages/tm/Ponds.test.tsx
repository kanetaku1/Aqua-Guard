import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** TM-02 must show the same values as prototype/screens/tm-ponds.html (mock_data.md, Farm A). */

const pondNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('.cell-main')!.textContent)

async function listTable() {
  const card = (await screen.findByRole('heading', { name: 'Pond List' })).closest('section')!
  return within(card).findByRole('table')
}

describe('TM-02 Pond List', () => {
  it('shows growth and today\'s records per Pond', async () => {
    renderApp('/tm/ponds', { userId: 'u-sari' })

    expect(await screen.findByText('Farm A · 8 Ponds')).toBeInTheDocument()
    expect(await screen.findByText('Next weekly sampling 5 Oct')).toBeInTheDocument()
    expect(await screen.findByText(/Growth \(latest sampling 28 Sep\)/)).toBeInTheDocument()

    const table = await listTable()
    expect(pondNames(table)).toEqual(['Pond 01', 'Pond 02', 'Pond 03', 'Pond 04', 'Pond 05', 'Pond 06', 'Pond 07', 'Pond 08'])

    const pond02 = within(within(table).getAllByRole('row')[2])
    expect(pond02.getByText('0.5 ha · DOC 62')).toBeInTheDocument()
    expect(pond02.getByText('Warning')).toHaveClass('badge--warning')
    expect(pond02.getByText('1 Unacknowledged')).toBeInTheDocument()
    expect(pond02.getByText('13.8 g')).toBeInTheDocument()
    expect(pond02.getByText('−8%')).toHaveClass('st--attention')
    expect(pond02.getByText('2 / 4')).toHaveClass('caption')
    expect(pond02.getByText('22')).toBeInTheDocument()
    expect(pond02.getByText('4 / 4')).toBeInTheDocument()

    expect(within(within(table).getAllByRole('row')[3]).getByText('+2%')).toHaveClass('st--normal')
    expect(screen.getByRole('link', { name: 'Ponds' })).toHaveClass('is-active')
  })

  it('filters by status, alert and name, keeping the filters in the URL', async () => {
    const { router } = renderApp('/tm/ponds', { userId: 'u-sari' })
    const table = await listTable()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'warning')
    expect(pondNames(table)).toEqual(['Pond 02', 'Pond 05'])
    expect(router.state.location.search).toBe('?status=warning')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), '')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Alerts' }), 'none')
    expect(pondNames(table)).toEqual(['Pond 01', 'Pond 03', 'Pond 06', 'Pond 07'])

    await userEvent.type(screen.getByRole('textbox', { name: 'Search Pond' }), '08')
    expect(screen.getByText('No Ponds match the filters')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(pondNames(table)).toHaveLength(8)
    expect(router.state.location.search).toBe('')
  })

  it('records weekly sampling for several Ponds at once', async () => {
    const { router } = renderApp('/tm/ponds', { userId: 'u-sari' })
    await userEvent.click(await screen.findByRole('button', { name: 'Record weekly sampling' }))
    expect(router.state.location.search).toBe('?sampling=1')

    const drawer = await screen.findByRole('dialog', { name: 'Record weekly sampling' })
    const d = within(drawer)
    expect(await d.findByDisplayValue('5 Oct 2026')).toBeInTheDocument()
    expect(d.getByText('3 of 8 Ponds entered')).toBeInTheDocument()

    // Already entered for 5 Oct (prototype): DOC on the sampling date, ABW and vs Target preview
    const row = (name: string) => within(d.getByText(name, { selector: 'td' }).closest('tr')!)
    expect(row('Pond 01').getByText('82')).toBeInTheDocument()
    expect(row('Pond 01').getByText('19.3 g')).toBeInTheDocument()
    expect(row('Pond 01').getByText('−2% On track')).toHaveClass('st--normal')
    expect(row('Pond 02').getByText('−10% Behind')).toHaveClass('st--attention')
    expect(row('Pond 04').getByText('Not sampled')).toBeInTheDocument()

    await userEvent.type(d.getByLabelText('Sample count for Pond 04'), '100')
    await userEvent.type(d.getByLabelText('Total weight for Pond 04'), '1,330')
    expect(row('Pond 04').getByText('13.3 g')).toBeInTheDocument()
    expect(row('Pond 04').getByText('−10% Behind')).toBeInTheDocument()
    expect(d.getByText('4 of 8 Ponds entered')).toBeInTheDocument()

    await userEvent.click(d.getByRole('button', { name: 'Save sampling' }))
    expect(await screen.findByText('Weekly sampling saved · 5 Oct 2026 · 4 Ponds')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('')
  })

  it('asks for both sample count and total weight', async () => {
    renderApp('/tm/ponds?sampling=1', { userId: 'u-sari' })
    const drawer = await screen.findByRole('dialog', { name: 'Record weekly sampling' })
    const d = within(drawer)
    await userEvent.type(await d.findByLabelText('Sample count for Pond 05'), '100')
    await userEvent.click(d.getByRole('button', { name: 'Save sampling' }))

    expect(await d.findByRole('alert')).toHaveTextContent('enter both sample count and total weight')
    expect(d.getByLabelText('Total weight for Pond 05')).toHaveClass('is-error')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
