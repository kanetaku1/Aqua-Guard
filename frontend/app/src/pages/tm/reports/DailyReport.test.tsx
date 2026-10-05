import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** TM-04 must match prototype/screens/tm-daily-report.html (Farm A, 29 Sep draft). */

const open = (query = '') => renderApp(`/tm/reports/daily${query}`, { userId: 'u-sari' })
const card = async (title: RegExp | string) => within((await screen.findByRole('heading', { name: title })).closest('section')!)

describe('TM-04 Daily Report', () => {
  it("shows today's draft with records collected automatically", async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: /Daily Report · 29 Sep 2026/ })).toBeInTheDocument()
    expect(await screen.findByText('Last saved 09:20 · due 18:00')).toBeInTheDocument()

    const completion = await card('Report completion')
    expect(completion.getByText('80% ready')).toBeInTheDocument()
    expect(completion.getByText('2 items to fill')).toBeInTheDocument()
    expect(completion.getByText('Records · 8 of 8 Ponds · 2 of 4 rounds so far')).toBeInTheDocument()
    expect(completion.getByText('Automatic · 1 equipment event · 3 alerts')).toBeInTheDocument()
    expect(completion.getByText('Optional · 1 Pond observed')).toBeInTheDocument()
    expect(completion.getByText('Weather and Summary needed')).toBeInTheDocument()

    const ponds = await card('Feeding · Mortality · Health')
    const pond02 = within(ponds.getByText('Pond 02').closest('tr')!)
    expect(pond02.getByText('74 kg')).toBeInTheDocument()
    expect(pond02.getByText('Reduced')).toHaveClass('st--attention')
    expect(pond02.getByText('Leftover')).toHaveClass('st--attention')
    expect(pond02.getByText('22')).toBeInTheDocument()
    expect(pond02.getByText('0.30 kg')).toBeInTheDocument()
    expect(pond02.getByText('Abnormal swimming, Reduced appetite')).toBeInTheDocument()
    const total = within(ponds.getByText('Farm A').closest('tr')!)
    expect(total.getByText('596 kg')).toBeInTheDocument()
    expect(total.getByText('74')).toBeInTheDocument()
    expect(total.getByText('1 reduced')).toBeInTheDocument()

    const alerts = await card('Major Alerts / Issues')
    expect(alerts.getAllByRole('row')).toHaveLength(5)
    expect(alerts.getByRole('checkbox', { name: 'Include ALT-1035 in the report' })).toHaveAttribute('aria-checked', 'false')
    expect(within(alerts.getByText('ALT-1042').closest('tr')!).getByText('1 h 45 min · ongoing')).toBeInTheDocument()

    const actions = await card('Actions Taken')
    const rows = actions.getAllByRole('row').slice(1)
    expect(rows.map((r) => (r as HTMLTableRowElement).cells[0].textContent)).toEqual(['05:40', '06:10', '06:30', '07:30'])
    expect(within(rows[0]).getByText('Increased aeration — aerators 3 and 4 on (manual override)')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Actuator log')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Water exchange — 10%')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Water treatment — Lime 25 kg applied')).toBeInTheDocument()

    const equipment = await card('Equipment Status')
    expect(equipment.getByText('Motor overheating')).toBeInTheDocument()
    expect(await equipment.findByText('Aerators 19 / 20 · Pumps 2 / 3 · Generator standby (tested 07:00)')).toBeInTheDocument()
  })

  it('records Pond observations and saves the draft', async () => {
    const { router } = open()
    const ponds = await card('Feeding · Mortality · Health')
    await userEvent.click(within(ponds.getByText('Pond 05').closest('tr')!).getByRole('link', { name: 'Edit' }))
    expect(router.state.location.search).toBe('?pond=farm-a-pond-05')

    const drawer = within(await screen.findByRole('dialog', { name: 'Pond 05' }))
    expect(drawer.getByText('80 kg · 2 / 4 rounds')).toBeInTheDocument()
    await userEvent.selectOptions(drawer.getByRole('combobox', { name: 'Health condition' }), 'attention')
    await userEvent.click(drawer.getByText('Reduced appetite'))
    await userEvent.click(drawer.getByRole('button', { name: 'Save Pond 05' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(ponds.getByText('Pond 05').closest('tr')!).getByText('Reduced appetite')).toBeInTheDocument()
    expect(screen.getByText('Optional · 2 Ponds observed')).toBeInTheDocument()
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    expect(await screen.findByText(/Last saved 09:35/)).toBeInTheDocument()
  })

  it('asks for Weather and Summary, then submits', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Submit Daily Report for 29 Sep?' }))
    expect(dialog.getByText('Weather and Summary required before submitting.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Submit' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Weather/ }), 'cloudy')
    await userEvent.type(screen.getByRole('textbox', { name: 'Technical Manager Summary' }), 'Calm day. Pond 02 DO warning handled with extra aeration.')
    expect(screen.getByText('100% ready')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Daily Report submitted')).toBeInTheDocument()
    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Weather/ })).toBeDisabled()
  })

  it('lists past reports and opens a submitted one read-only', async () => {
    open('?tab=history')
    const history = await card('Daily Report History')
    const r28 = within((await history.findByText('28 Sep 2026')).closest('tr')!)
    expect(r28.getByText('Submitted')).toBeInTheDocument()
    expect(r28.getByText('3')).toBeInTheDocument() // Ponds needing attention: 02, 05 and 08 (sensor offline, 04 §7)
    expect(r28.getByText('1,240 kg')).toBeInTheDocument()
    expect(r28.getByText('186 pcs')).toBeInTheDocument()
    expect(r28.getByText('28 Sep 18:20')).toBeInTheDocument()
    const r29 = within(history.getByText('29 Sep 2026').closest('tr')!)
    expect(r29.getByText('3')).toBeInTheDocument()
    expect(r29.getByRole('link', { name: 'Continue' })).toBeInTheDocument()

    await userEvent.click(r28.getByRole('link', { name: 'View' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Daily Report · 28 Sep 2026/ })).toBeInTheDocument()
    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Weather/ })).toHaveDisplayValue('Cloudy')
    expect(screen.getByDisplayValue('Light rain 13:00–14:00')).toBeDisabled()
  })
})
