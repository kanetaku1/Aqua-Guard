import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** TM-05 must match prototype/screens/tm-weekly-report.html (Farm A, 22–28 Sep draft). */

const open = (query = '') => renderApp(`/tm/reports/weekly${query}`, { userId: 'u-sari' })
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section')!)
const rowOf = (scope: ReturnType<typeof within>, name: string) => within(scope.getByText(name, { selector: 'td' }).closest('tr')!)

describe('TM-05 Weekly Report', () => {
  it('shows summary, production KPIs and the weekly charts', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: /Weekly Report · 22–28 Sep 2026/ })).toBeInTheDocument()
    expect(screen.getByText('Farm A · 8 Ponds · DOC 34–76')).toBeInTheDocument()
    expect(screen.getByText('Last saved 28 Sep 20:15 · due today')).toBeInTheDocument()

    const summary = await card('Summary')
    expect(summary.getByRole('combobox')).toHaveDisplayValue('Warning')
    expect(summary.getByText('2 of 8')).toBeInTheDocument()
    expect(summary.getByText('8,610 kg')).toBeInTheDocument()
    expect(summary.getByText('1,036 pcs · 13.2 kg')).toBeInTheDocument()
    expect(summary.getByText('4 · 2 ongoing')).toBeInTheDocument()

    expect(screen.getByText(/Weekly sampling 28 Sep: 8 of 8 Ponds sampled · laboratory 7 of 8 received/)).toBeInTheDocument()
    expect(screen.getByText('+1.4 t vs previous week')).toBeInTheDocument()
    expect(screen.getByText('−1 pt vs previous week')).toBeInTheDocument()
    expect(screen.getByText('+0.02 vs previous week')).toBeInTheDocument()
    expect(screen.getByText('2 Ponds behind (02, 05)')).toBeInTheDocument()

    const donuts = await card('Feeding and mortality by Pond')
    expect(donuts.getByText('1,318 kg')).toBeInTheDocument()
    expect(donuts.getByText('241 pcs')).toBeInTheDocument()

    const ponds = await card('Ponds this week')
    expect(rowOf(ponds, 'Pond 02').getByText('−8% Behind')).toHaveClass('st--attention')
    expect(screen.getByRole('link', { name: /Laboratory/ }).querySelector('.count')).toHaveTextContent('1')
  })

  it('switches the Ponds this week topics', async () => {
    const { router } = open()
    const ponds = await card('Ponds this week')

    await userEvent.click(screen.getByRole('link', { name: 'Water quality trends' }))
    expect(router.state.location.search).toBe('?pw=wq')
    expect(rowOf(ponds, 'Pond 02').getByText('4.3')).toHaveClass('val-warning')
    expect(rowOf(ponds, 'Pond 05').getByText('Temp')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Feeding & mortality' }))
    const pond02 = rowOf(ponds, 'Pond 02')
    expect(pond02.getByText('16.1')).toBeInTheDocument()
    expect(pond02.getByText('28 Sep (64)')).toBeInTheDocument()
    expect(pond02.getByText('+26%')).toBeInTheDocument()
    const total = within(ponds.getByText('Farm A total').closest('tr')!)
    expect(total.getByText('2 Ponds')).toBeInTheDocument()
    expect(total.getByText('10.2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /Laboratory/ }))
    expect(rowOf(ponds, 'Pond 08').getByText('results expected 30 Sep')).toBeInTheDocument()
    expect(rowOf(ponds, 'Pond 02').getByText('7.2')).toHaveClass('val-attention')
  })

  it('adds an alert note and submits with the weekly summary', async () => {
    open()
    const alerts = await card('Major Alerts / Issues')
    expect(alerts.getByText('Low wind, high biomass · aeration + feed −10% · —')).toBeInTheDocument()
    await userEvent.click(within(alerts.getByText('pH below threshold').closest('tr')!).getByRole('button', { name: 'Add note' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'pH below threshold' }))
    await userEvent.type(drawer.getByRole('textbox', { name: 'Cause' }), 'Rain runoff')
    await userEvent.click(drawer.getByRole('button', { name: 'Apply' }))
    expect(alerts.getByText('Rain runoff · — · —')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Submit Weekly Report for 22–28 Sep?' }))
    expect(dialog.getByText(/Pond 08 laboratory results are still pending/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Submit' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await userEvent.type(screen.getByRole('textbox', { name: 'Weekly Technical Summary' }), 'Ponds 02 and 05 behind target; DO handled in Pond 02.')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Weekly Report submitted')).toBeInTheDocument()
    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument()
  })

  it('lists weekly reports and opens a submitted one', async () => {
    open('?tab=history')
    const history = await card('Weekly Report History')
    const r15 = within((await history.findByText('15–21 Sep 2026')).closest('tr')!)
    expect(r15.getByText('10.2 t')).toBeInTheDocument()
    expect(r15.getByText('89%')).toBeInTheDocument()
    expect(r15.getByText('22 Sep 10:10')).toBeInTheDocument()
    await userEvent.click(r15.getByRole('link', { name: 'View' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Weekly Report · 15–21 Sep 2026/ })).toBeInTheDocument()
    // Submitted reports read as text, not as a disabled form
    expect(await screen.findByText(/6 of 8 Ponds are on the growth target/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Weekly Technical Summary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })
})
