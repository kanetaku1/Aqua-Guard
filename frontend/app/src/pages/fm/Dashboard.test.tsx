import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** FM-01 must match prototype/screens/fm-dashboard.html (mock_data.md, 4 Farms). */

const open = () => renderApp('/fm/dashboard', { userId: 'u-hendra' })
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section')!)

describe('FM-01 Dashboard', () => {
  it('shows Farm status with the facts behind it, most severe first', async () => {
    open()
    expect(await screen.findByText('4 Farms · 32 Ponds')).toBeInTheDocument()
    expect(screen.getByText('All Farms (4)')).toBeInTheDocument()

    const farms = await card('Farm Status')
    const table = await farms.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('.cell-main')!.textContent)).toEqual(['Farm D', 'Farm A', 'Farm C', 'Farm B'])
    const counts = farms.getAllByText(/^(Critical|Warning|Attention|Normal)$/, { selector: '.status-count .status-text' })
    expect(counts.map((c) => c.parentElement!.querySelector('.status-count-value')!.textContent)).toEqual(['1Farm', '1Farm', '1Farm', '1Farm'])

    const farmD = within(rows[0])
    expect(farmD.getByText('Critical')).toHaveClass('badge--critical')
    expect(farmD.getByText('Pond 06 DO critically low for 8 hrs; mortality rising')).toBeInTheDocument()
    expect(farmD.getByText('1 of 8 Ponds')).toHaveClass('st--critical')
    expect(farmD.getByText('4 of 8 behind')).toHaveClass('st--warning')
    expect(farmD.getByText('2 devices offline')).toHaveClass('st--attention')
    expect(within(rows[3]).getByText('Normal')).toHaveClass('status-text')
  })

  it('lists live Risk / Issues without raw sensor values', async () => {
    open()
    const issues = await card('Risk / Issue')
    expect(await issues.findByText(/6 open, sorted by severity/)).toBeInTheDocument()
    const titles = issues.getAllByText(/ · /, { selector: '.alert-title' }).map((e) => e.textContent)
    expect(titles[0]).toBe('Water Quality · DO decreasing')
    expect(titles[1]).toBe('Mortality · Mortality increasing')
    expect(issues.getByText('ISS-214').closest('.alert-row')).toHaveTextContent('Farm D')
    expect(issues.queryByText(/mg\/L/)).not.toBeInTheDocument()
    expect(issues.getAllByRole('link', { name: 'View Farm' })[0]).toHaveAttribute('href', '/fm/farms/farm-d')
  })

  it('shows Company production totals only', async () => {
    open()
    expect(await screen.findByText('55.6')).toBeInTheDocument()
    expect(screen.getByText('+3.9 t vs last week')).toBeInTheDocument()
    // Survival Rate is weighted by stocked PL (04 §4), not an average of Pond percentages
    expect(screen.getByText('84')).toBeInTheDocument()
    expect(screen.getByText('−1 pt vs last week')).toBeInTheDocument()
    expect(screen.getByText('7 / 32')).toBeInTheDocument()
    expect(screen.getByText('+1 vs last week')).toBeInTheDocument()
    expect(screen.getByText('8 hrs')).toBeInTheDocument() // ISS-214 elapsed
    expect(screen.queryByText(/ABW \d/)).not.toBeInTheDocument()
  })

  it('opens a Farm from the table', async () => {
    const { router } = open()
    const farms = await card('Farm Status')
    await userEvent.click(await farms.findByText('Farm C'))
    expect(router.state.location.pathname).toBe('/fm/farms/farm-c')
  })
})
