import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** FM-04〜06 must match prototype/screens/fm-reports.html, fm-daily-report.html, fm-weekly-report.html. */

const asFm = (path: string) => renderApp(path, { userId: 'u-hendra' })
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section, .card, details')! as HTMLElement)

describe('FM-04 Report List', () => {
  it('lists submitted reports of every Farm, newest first', async () => {
    asFm('/fm/reports')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[]
    expect(rows).toHaveLength(8)
    expect(rows.map((r) => `${r.cells[0].textContent} ${r.cells[1].textContent}`).slice(0, 4)).toEqual([
      '28 Sep 2026 Farm A',
      '28 Sep 2026 Farm B',
      '28 Sep 2026 Farm C',
      '28 Sep 2026 Farm D',
    ])
    expect(screen.getByText('Showing 1–8 of 8')).toBeInTheDocument()
    // The Farm A draft of 29 Sep is never listed for the Farms Manager
    expect(within(table).queryByText('29 Sep 2026')).not.toBeInTheDocument()

    // Period switch: 24h keeps only the latest day
    await userEvent.click(within(screen.getByRole('group', { name: 'Period' })).getByRole('button', { name: '24h' }))
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(4)
  })

  it('switches to weekly reports and filters by Farm', async () => {
    const { router } = asFm('/fm/reports')
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Tabs' })).getByRole('link', { name: 'Weekly Reports' }))
    expect(router.state.location.search).toBe('?type=weekly')
    const table = await screen.findByRole('table')
    expect(await within(table).findAllByText('15–21 Sep 2026')).toHaveLength(4)
    expect(within(table).queryByText('22–28 Sep 2026')).not.toBeInTheDocument() // draft

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Farm' }), 'farm-d')
    expect((within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[]).every((r) => r.cells[1].textContent === 'Farm D')).toBe(true)
  })
})

describe('FM-05 Daily Report Detail', () => {
  it('shows the day as operations only, with Ponds at a glance', async () => {
    asFm('/fm/reports/daily/daily-farm-a-2026-09-28')
    expect(await screen.findByRole('heading', { level: 1, name: /Daily Report · Farm A/ })).toBeInTheDocument()
    expect(screen.getByText('2 of 8 (02, 05)')).toBeInTheDocument()
    expect(screen.getByText('1,240 kg', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('186 pcs · 2.40 kg')).toBeInTheDocument()
    expect(screen.getByText('3 · 2 resolved')).toBeInTheDocument()

    const glance = await card('Ponds at a glance')
    const pond02 = glance.getByText('Pond 02').closest('.pond-tile')!
    expect(pond02).toHaveClass('is-warning')
    expect(pond02).toHaveTextContent('DO alert 05:20 · resolved 07:00')
    // No sensor values in the Pond tiles or the alert list (05 FM-05)
    expect(glance.queryByText(/mg\/L|°C/)).not.toBeInTheDocument()
    expect((await card('Major Alerts / Issues')).queryByText(/mg\/L|°C/)).not.toBeInTheDocument()

    expect(screen.getByText(/Pond 02 DO dropped below 4.5/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveTextContent('27 Sep')
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/fm/reports/daily/daily-farm-a-2026-09-27')
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled() // the 29 Sep draft is not visible to the FM
  })

  it('does not open a draft', async () => {
    asFm('/fm/reports/daily/daily-farm-a-2026-09-29')
    expect(await screen.findByText(/not been submitted yet/)).toBeInTheDocument()
  })
})

describe('FM-06 Weekly Report Detail', () => {
  it('renders the weekly report read-only', async () => {
    asFm('/fm/reports/weekly/weekly-farm-a-2026-09-15')
    expect(await screen.findByRole('heading', { level: 1, name: /Weekly Report · Farm A/ })).toBeInTheDocument()
    expect(screen.getByText('15–21 Sep 2026 · DOC 27–69')).toBeInTheDocument()
    expect(await screen.findByText('Farm Condition (end of week)')).toBeInTheDocument()
    expect(screen.getByText('3 · all resolved')).toBeInTheDocument()
    expect(screen.getByText('Weekly sampling 21 Sep · compared with previous week')).toBeInTheDocument()
    expect(screen.getByText(/18 Sep — Pond 05 water exchange 15% to reduce temperature/)).toBeInTheDocument()
    expect(screen.getByText(/6 of 8 Ponds are on the growth target/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit|Save Draft|Add note/ })).not.toBeInTheDocument()
  })
})
