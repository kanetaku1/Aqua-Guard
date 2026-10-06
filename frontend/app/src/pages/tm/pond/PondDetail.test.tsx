import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** TM-03 must show the same values as prototype/screens/tm-pond-detail.html (Pond 02, Farm A). */

const POND = '/tm/ponds/farm-a-pond-02'
const open = (query = '') => renderApp(`${POND}${query}`, { userId: 'u-sari' })
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section')!)

describe('TM-03 Pond Detail', () => {
  it('shows the Pond header and tabs', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: /Pond 02/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).querySelector('.badge--warning.badge--lg')).toHaveTextContent('Warning')
    expect(screen.getByText('Stocked 29 Jul 2026 · DOC 62')).toBeInTheDocument()
    expect(screen.getByText('150,000 PL stocked · ABW 13.8 g')).toBeInTheDocument()
    expect(screen.getByText('Last updated 09:35')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alerts/ }).querySelector('.count')).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: 'IoT / Water Quality' })).toHaveClass('is-active')
    expect(document.title).toBe('TM-03 Pond Detail · AquaGuard')
  })

  it('IoT: current values, anomalies and raw history', async () => {
    open()
    const doTile = await screen.findByRole('button', { name: 'Show the DO time series' })
    expect(doTile).toHaveClass('is-selected')
    expect(within(doTile).getByText('4.1')).toBeInTheDocument()
    expect(within(doTile).getByText('Warning')).toHaveClass('badge--warning')
    expect(within(doTile).getByText('Range ≥ 4.5')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Show the TDS time series' })).getByText('18,900')).toBeInTheDocument()

    const anomalies = await card('Anomalies')
    expect(await anomalies.findByText('DO decreasing')).toBeInTheDocument()
    expect(anomalies.getByText('−1.3 mg/L vs 27 Sep avg.')).toBeInTheDocument()
    expect(anomalies.getByText('Since 07:50')).toBeInTheDocument()
    expect(anomalies.getByText('Min 4.1 mg/L')).toBeInTheDocument()
    expect(anomalies.getByText('Temperature increasing')).toBeInTheDocument()
    expect(anomalies.getByText('within range')).toBeInTheDocument()

    const history = await card('Historical Data')
    expect(await history.findByText('Showing 6 of 116 readings')).toBeInTheDocument()
    const first = within(history.getAllByRole('row')[1])
    expect(first.getByText('29 Sep 09:35')).toBeInTheDocument()
    expect(first.getByText('4.1')).toHaveClass('val-warning')
    expect(first.getByText('18,900')).not.toHaveClass('val-warning')
    await userEvent.click(history.getByText('2'))
    expect(await history.findByText('29 Sep 09:05')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show the pH time series' }))
    expect(await screen.findByRole('heading', { name: 'Sensor Time Series · pH' })).toBeInTheDocument()
  })

  it('Alerts: acknowledge, record an action and resolve', async () => {
    const { router } = open('?tab=alerts')
    const alerts = await card('Alerts')
    await waitFor(() => expect(alerts.getAllByRole('row')).toHaveLength(4))
    expect(alerts.getByText('ALT-1011')).toBeInTheDocument()

    await userEvent.click(alerts.getByRole('link', { name: 'Acknowledge' }))
    expect(router.state.location.search).toBe('?tab=alerts&alert=ALT-1042')
    const drawer = within(await screen.findByRole('dialog'))
    expect(drawer.getByText('4.1 mg/L / ≥ 4.5')).toBeInTheDocument()
    expect(drawer.getByText('1 h 45 min · ongoing')).toBeInTheDocument()
    expect(drawer.getByText('A-P02-DO · Online')).toBeInTheDocument()
    expect(drawer.getByText('ISS-218 (Farm issue)')).toBeInTheDocument()
    expect(drawer.getByText('Actuator log')).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: 'Resolve' })).toBeDisabled()

    await userEvent.click(drawer.getByRole('button', { name: 'Acknowledge' }))
    expect(await drawer.findByText('Acknowledged', { selector: '.status-text' })).toBeInTheDocument()

    await userEvent.selectOptions(drawer.getByRole('combobox'), 'water_exchange')
    await userEvent.type(drawer.getByPlaceholderText('What was done and what happened'), 'Exchanged 10%')
    await userEvent.click(drawer.getByRole('button', { name: 'Record action' }))
    expect(await drawer.findByText('Water exchange — Exchanged 10%')).toBeInTheDocument()
    expect(drawer.getByText('In Progress', { selector: '.status-text' })).toBeInTheDocument()

    await userEvent.click(drawer.getByRole('button', { name: 'Resolve' }))
    expect(await drawer.findByText('Resolved', { selector: '.status-text' })).toBeInTheDocument()
    expect(drawer.queryByRole('button', { name: 'Record action' })).not.toBeInTheDocument()
  })

  it('Feeding: records the next round with the plan as a hint', async () => {
    open('?tab=feeding')
    const history = await card('Feeding History')
    expect(await history.findByText('28 Sep total 152 kg · 29 Sep so far 74 kg')).toBeInTheDocument()
    const first = within(history.getAllByRole('row')[1])
    expect(first.getByText('29 Sep 09:00')).toBeInTheDocument()
    expect(first.getByText('Leftover < 5%')).toBeInTheDocument()

    const form = await card('Record Feeding')
    expect(form.getByRole('combobox', { name: /Round/ })).toHaveDisplayValue('13:00 (3rd)')
    expect(form.getByText('Plan: 38 kg · reduced 10% due to low DO')).toBeInTheDocument()

    await userEvent.click(form.getByRole('button', { name: 'Save Record' }))
    expect(form.getByText('Enter the amount in kg (more than 0).')).toBeInTheDocument()

    await userEvent.type(form.getByPlaceholderText('38'), '34')
    await userEvent.click(form.getByRole('button', { name: 'Save Record' }))
    expect(await screen.findByText('Feeding record saved')).toBeInTheDocument()
    expect(screen.getByText('Pond 02 · 29 Sep 13:00 · 34 kg')).toBeInTheDocument()
    expect(await history.findByText('28 Sep total 152 kg · 29 Sep so far 108 kg')).toBeInTheDocument()
    expect(form.getByRole('combobox', { name: /Round/ })).toHaveDisplayValue('17:00 (4th)')
  })

  it('Mortality: needs count and weight, then saves', async () => {
    open('?tab=mortality')
    const history = await card('Mortality History')
    expect(await history.findByText('Last 7 days total 187 pcs · 2.43 kg')).toBeInTheDocument()
    expect(history.getByText('0.82 kg')).toBeInTheDocument()

    const form = await card('Record Mortality')
    await userEvent.type(form.getByPlaceholderText('0'), '12')
    await userEvent.click(form.getByRole('button', { name: 'Save Record' }))
    expect(form.getByText(/Enter the count/)).toBeInTheDocument()
    await userEvent.type(form.getByPlaceholderText('0.00'), '0.15')
    await userEvent.click(form.getByRole('button', { name: 'Save Record' }))
    expect(await screen.findByText('Mortality record saved')).toBeInTheDocument()
    expect(await history.findByText('Last 7 days total 199 pcs · 2.58 kg')).toBeInTheDocument()
  })

  it('Sampling: history with lab status, ABW preview and save', async () => {
    open('?tab=sampling')
    const history = await card('Sampling History')
    const row = within((await history.findByText('28 Sep')).closest('tr')!)
    expect(row.getByText('13.8 g')).toBeInTheDocument()
    expect(row.getByText('0.21 g/d')).toBeInTheDocument()
    expect(row.getByText('7.2')).toHaveClass('val-attention')
    expect(history.getByText('Weekly sampling · next due 5 Oct')).toBeInTheDocument()

    const form = await card('Record Sampling')
    await userEvent.type(form.getByPlaceholderText('100'), '100')
    await userEvent.type(form.getByPlaceholderText('0'), '1,450')
    expect(form.getByText('14.5 g')).toBeInTheDocument()
    await userEvent.click(form.getByRole('button', { name: 'Save Record' }))
    expect(await screen.findByText('Sampling record saved')).toBeInTheDocument()
    expect(await history.findByText('29 Sep')).toBeInTheDocument()
  })

  it('Actuator: confirms manual operation and logs it', async () => {
    open('?tab=actuator')
    const tile = async (name: string) => within((await screen.findByText(name, { selector: '.strong' })).closest('.actuator') as HTMLElement)
    const aerator3 = await tile('Aerator 3')
    expect(aerator3.getByText('override')).toBeInTheDocument()
    expect(aerator3.getByText('05:40')).toBeInTheDocument()
    const pump = await tile('Water Pump 1')
    expect(pump.getByText('28 Sep 15:10')).toBeInTheDocument()

    await userEvent.click(pump.getByRole('button', { name: 'Turn On' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Turn on Water Pump 1?' }))
    expect(dialog.getByText('132 cm')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Turn On' }))
    expect(await screen.findByText('Water Pump 1 turned on')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const log = await card('Control History')
    const latest = within((await log.findAllByText('Water Pump 1'))[0].closest('tr')!)
    await waitFor(() => expect(latest.getByText('Manual (override)')).toBeInTheDocument())
    expect(latest.getByText('Sari Wijaya')).toBeInTheDocument()
    expect(log.getByText('Blocked by Safety Layer')).toBeInTheDocument()

    await userEvent.click(aerator3.getByRole('button', { name: 'Return to Auto' }))
    expect(await screen.findByText('Aerator 3 returned to Auto')).toBeInTheDocument()
  })
})
