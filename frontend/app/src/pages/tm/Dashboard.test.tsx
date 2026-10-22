import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { farmAWaterQuality, normalRanges } from '@/mocks/data'
import { api } from '@/mocks/http'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

/** Water quality with these Ponds' locations removed. */
const withoutLocation = (ids: string[]) =>
  server.use(
    http.get(api('/farms/:farmId/ponds/water-quality'), () =>
      HttpResponse.json({
        items: farmAWaterQuality.map((r) => (ids.includes(r.pond.id) ? { ...r, location: null } : r)),
        counts: { critical: 0, warning: 2, attention: 1, normal: 5 },
        normalRanges,
      }),
    ),
  )

/** TM-01 must show the same values as prototype/screens/tm-dashboard.html (mock_data.md, Farm A). */
describe('TM-01 Dashboard', () => {
  it('renders Pond Status as a map with counts, and the table values in each Pond tooltip', async () => {
    const { router } = renderApp('/tm/dashboard', { userId: 'u-sari' })

    expect(await screen.findByText('Farm A · 8 Ponds · DOC 34–76')).toBeInTheDocument()

    const card = (await screen.findByRole('heading', { name: 'Pond Status' })).closest('section')!
    const map = await within(card).findByRole('region', { name: 'Map of Pond status' })
    expect(within(card).queryByRole('columnheader')).not.toBeInTheDocument() // the former table is gone

    // One marker per Pond at its position; Pond 01 at the site's first surveyed point
    const markers = within(map).getAllByRole('button')
    expect(markers.map((m) => m.textContent)).toEqual([
      'Pond 02, Warning', 'Pond 05, Warning', 'Pond 04, Attention', 'Pond 08, Normal',
      'Pond 01, Normal', 'Pond 03, Normal', 'Pond 06, Normal', 'Pond 07, Normal',
    ])
    expect(within(map).getByRole('button', { name: 'Pond 01, Normal' }).parentElement).toHaveAttribute('data-position', '-6.259871,106.644181')

    // Counts Critical / Warning / Attention / Normal = 0 / 2 / 1 / 5
    const summary = within(card).getAllByText(/^(Critical|Warning|Attention|Normal)$/, { selector: '.status-count .status-text' })
    expect(summary.map((s) => s.parentElement!.querySelector('.status-count-value')!.textContent)).toEqual([
      '0Ponds', '2Ponds', '1Pond', '5Ponds',
    ])

    // Pond 02 tooltip: Warning badge, DO 4.1 highlighted, 1 Unacknowledged
    const tip = (name: string) => within(within(map).getByRole('button', { name }).parentElement!.querySelector<HTMLElement>('[role=tooltip]')!)
    const pond02 = tip('Pond 02, Warning')
    expect(pond02.getByText('Pond 02')).toBeInTheDocument()
    expect(pond02.getByText('Warning')).toHaveClass('badge--warning')
    expect(pond02.getByText('4.1')).toHaveClass('val-warning')
    expect(pond02.getByText('18,900')).not.toHaveClass('val-warning')
    expect(pond02.getByText('1 Unacknowledged')).toBeInTheDocument()

    // Pond 08: turbidity sensor offline
    expect(tip('Pond 08, Normal').getByText('Offline')).toHaveClass('st--offline')

    expect(within(card).getByText(/Normal range: DO ≥ 5.0 · pH 7.5–8.5 · Temp 26.5–30.5 · TDS 16,000–24,000/)).toBeInTheDocument()
    expect(within(card).queryByText('Location not set:')).not.toBeInTheDocument()

    // Clicking a Pond opens its detail
    await userEvent.click(within(map).getByRole('button', { name: 'Pond 05, Warning' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tm/ponds/farm-a-pond-05'))
  })

  it('lists Ponds without a location below the map, and explains when none has one', async () => {
    withoutLocation(['farm-a-pond-07', 'farm-a-pond-02'])
    renderApp('/tm/dashboard', { userId: 'u-sari' })
    const card = (await screen.findByRole('heading', { name: 'Pond Status' })).closest('section')!
    const unset = (await within(card).findByText('Location not set:')).parentElement!
    expect(within(unset).getAllByRole('link').map((a) => a.textContent)).toEqual(['Pond 02Warning', 'Pond 07Normal'])
    expect(within(unset).getByRole('link', { name: /Pond 02/ })).toHaveAttribute('href', '/tm/ponds/farm-a-pond-02')
    expect(within(within(card).getByRole('region', { name: 'Map of Pond status' })).getAllByRole('button')).toHaveLength(6)
  })

  it('says who sets the locations when no Pond has one', async () => {
    withoutLocation(farmAWaterQuality.map((r) => r.pond.id))
    renderApp('/tm/dashboard', { userId: 'u-sari' })
    expect(await screen.findByText('No Pond locations yet')).toBeInTheDocument()
    expect(screen.getByText('The System Administrator sets them in Farms & Ponds › Ponds.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Map of Pond status' })).not.toBeInTheDocument()
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
