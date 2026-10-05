import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** FM-02 / FM-03 must match prototype/screens/fm-farms.html and fm-farm-detail.html. */

const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section, .card')! as HTMLElement)

describe('FM-02 Farm List', () => {
  it('lists Farms with location and open issues, filters in the URL', async () => {
    const { router } = renderApp('/fm/farms', { userId: 'u-hendra' })
    const list = await card('Farm List')
    expect(await list.findByText('Lombok, West Nusa Tenggara · 8 Ponds')).toBeInTheDocument()
    const rows = within(list.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('.cell-main')!.textContent)).toEqual(['Farm D', 'Farm A', 'Farm C', 'Farm B'])
    expect(within(rows[1]).getByText('3')).toHaveClass('num')
    expect(list.getByText('4 Farms · 32 Ponds')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Risk / Issue' }), 'none')
    expect(router.state.location.search).toBe('?issues=none')
    expect(list.getAllByRole('row').slice(1).map((r) => r.querySelector('.cell-main')!.textContent)).toEqual(['Farm B'])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Risk / Issue' }), '')
    await userEvent.type(screen.getByRole('textbox', { name: 'Search Farm name or location' }), 'east java')
    expect(list.getAllByRole('row').slice(1).map((r) => r.querySelector('.cell-main')!.textContent)).toEqual(['Farm A', 'Farm C'])
  })
})

describe('FM-03 Farm Detail', () => {
  it('shows the Farm header, the three aspects and the status trend', async () => {
    renderApp('/fm/farms/farm-a', { userId: 'u-hendra' })
    expect(await screen.findByRole('heading', { level: 1, name: /Farm A/ })).toBeInTheDocument()
    expect(screen.getByText('Technical Manager: Sari Wijaya')).toBeInTheDocument()
    expect(screen.getByText('8 Ponds · DOC 34–76')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Latest report: Daily · 28 Sep' })).toHaveAttribute('href', '/fm/reports/daily/daily-farm-a-2026-09-28')

    const status = await card('Farm Status')
    expect(status.getByText(/because Water quality is Warning/)).toBeInTheDocument()
    expect(status.getByText('of 8 Ponds out of range')).toBeInTheDocument()
    expect(status.getByText('Pond 02 −8% · Pond 05 −7% (sampling 28 Sep)')).toBeInTheDocument()
    const strip = await status.findByRole('img', { name: 'Status trend' })
    expect(strip.querySelectorAll('span')).toHaveLength(14)
    expect(strip.querySelectorAll('.s-warning')).toHaveLength(3)
    // No link into Technical Manager screens (05 §2.3)
    expect(document.querySelector('a[href^="/tm/"]')).toBeNull()
  })

  it('shows Risk / Issue and the read-only alert drawer', async () => {
    const { router } = renderApp('/fm/farms/farm-a', { userId: 'u-hendra' })
    const issues = await card('Risk / Issue')
    expect(await issues.findByText(/3 open, sorted by severity/)).toBeInTheDocument()
    const first = within(issues.getAllByRole('row')[1])
    expect(first.getByText('Ongoing · 2 days')).toBeInTheDocument()
    await userEvent.click(first.getByRole('link', { name: 'View Alert' }))
    expect(router.state.location.search).toBe('?issue=ISS-218')

    const drawer = within(await screen.findByRole('dialog', { name: 'Water Quality · DO decreasing' }))
    expect(drawer.getByText('Sari Wijaya (Technical Manager)')).toBeInTheDocument()
    expect(drawer.getByText('DO back in range by 07:00')).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'Daily Report · 28 Sep' })).toBeInTheDocument()
    expect(drawer.getByText(/This view is read-only/)).toBeInTheDocument()
    expect(drawer.queryByRole('button', { name: /Acknowledge|Resolve/ })).not.toBeInTheDocument()
  })

  it('shows production with weighted Farm values and no averaged ABW', async () => {
    renderApp('/fm/farms/farm-a', { userId: 'u-hendra' })
    const pps = await card('Pond Production Summary')
    const total = within((await pps.findByText('6 on track · 2 behind')).closest('tr')!)
    expect(total.getByText('88%')).toBeInTheDocument()
    expect(total.getByText('1.31')).toBeInTheDocument()
    expect(total.getByText('11.6 t')).toBeInTheDocument()
    expect(total.getAllByText('—').length).toBeGreaterThanOrEqual(3) // ABW, target, ADG are not averaged
    expect(within(pps.getByText('Pond 02').closest('tr')!).getByText('−8% Behind')).toHaveClass('st--attention')
    expect(screen.getByText('2 Ponds behind (02, 05)')).toBeInTheDocument()
  })

  it('works for every Farm of the Company', async () => {
    renderApp('/fm/farms/farm-d', { userId: 'u-hendra' })
    expect(await screen.findByRole('heading', { level: 1, name: /Farm D/ })).toBeInTheDocument()
    const pps = await card('Pond Production Summary')
    expect(await pps.findByText('4 on track · 4 behind')).toBeInTheDocument()
  })
})
