import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** TM-01 must show the same values as prototype/screens/tm-dashboard.html (mock_data.md, Farm A). */
describe('TM-01 Dashboard', () => {
  it('renders Pond Status with counts, highlighted values and sorted rows', async () => {
    renderApp('/tm/dashboard', { userId: 'u-sari' })

    expect(await screen.findByText('Farm A · 8 Ponds · DOC 34–76')).toBeInTheDocument()

    const card = (await screen.findByRole('heading', { name: 'Pond Status' })).closest('section')!
    const table = await within(card).findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Pond 02', 'Pond 05', 'Pond 04', 'Pond 08', 'Pond 01', 'Pond 03', 'Pond 06', 'Pond 07',
    ])

    // Counts Critical / Warning / Attention / Normal = 0 / 2 / 1 / 5
    const summary = within(card).getAllByText(/^(Critical|Warning|Attention|Normal)$/, { selector: '.status-count .status-text' })
    expect(summary.map((s) => s.parentElement!.querySelector('.status-count-value')!.textContent)).toEqual([
      '0Ponds', '2Ponds', '1Pond', '5Ponds',
    ])

    // Pond 02: Warning badge, DO 4.1 highlighted, 1 Unacknowledged
    const pond02 = within(rows[0])
    expect(pond02.getByText('Warning')).toHaveClass('badge--warning')
    expect(pond02.getByText('4.1')).toHaveClass('val-warning')
    expect(pond02.getByText('18,900')).not.toHaveClass('val-warning')
    expect(pond02.getByText('1 Unacknowledged')).toBeInTheDocument()

    // Pond 08: turbidity sensor offline
    expect(within(rows[3]).getByText('Offline')).toHaveClass('st--offline')

    expect(within(card).getByText(/Normal range: DO ≥ 5.0 · pH 7.5–8.5 · Temp 26.5–30.5 · TDS 16,000–24,000/)).toBeInTheDocument()
  })

  it('renders Active Alerts, Operational Status and Report Status', async () => {
    renderApp('/tm/dashboard', { userId: 'u-sari' })

    expect(await screen.findByText('4 unresolved · 1 unacknowledged')).toBeInTheDocument()
    expect(screen.getByText('DO below threshold (4.1 mg/L < 4.5)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acknowledge' })).toHaveAttribute(
      'href',
      '/tm/ponds/farm-a-pond-02?tab=alerts&alert=ALT-1042',
    )
    expect(screen.getByText('28 Sep 22:10')).toBeInTheDocument()

    expect(await screen.findByText('19 / 20')).toBeInTheDocument()
    expect(screen.getByText('2 / 4 rounds')).toBeInTheDocument()
    expect(screen.getByText('5 Oct')).toBeInTheDocument()
    expect(screen.getByText('Standby')).toBeInTheDocument()

    expect(await screen.findByText('Daily Report · 29 Sep')).toBeInTheDocument()
    expect(screen.getByText('Due today 18:00 · last saved 09:20')).toBeInTheDocument()
    expect(screen.getByText('Weekly Report · 22–28 Sep')).toBeInTheDocument()
    expect(screen.getByText('Due today · last saved 28 Sep 20:15')).toBeInTheDocument()
    expect(screen.getByText('Daily · 28 Sep 18:20')).toBeInTheDocument()
  })

  it('shows the Technical Manager shell', async () => {
    renderApp('/tm/dashboard', { userId: 'u-sari' })
    expect(await screen.findByText('Sari Wijaya')).toBeInTheDocument()
    expect(screen.getByText('Farm A · East Java')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Data synced 29 Sep 2026 09:35 WIB')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('is-active')
    expect(document.title).toBe('TM-01 Dashboard · AquaGuard')
  })
})
