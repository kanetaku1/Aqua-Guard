import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** AD-02 must match the wireframe sa-farms-ponds.png and 05 §5B AD-02. */

const open = (query = '') => renderApp(`/ad/farms${query}`, { userId: 'u-yusuf' })
const rowOf = async (name: string) => within((await screen.findByText(name, { selector: 'td' })).closest('tr')!)

describe('AD-02 Farm List', () => {
  it('lists the Farm master without business data', async () => {
    open()
    expect(await screen.findByText('Master data · 5 Farms (4 active) · 33 Ponds')).toBeInTheDocument()
    const farmA = await rowOf('Farm A')
    expect(farmA.getByText('(8 in operation)')).toBeInTheDocument()
    expect(farmA.getByText('70 / 71')).toHaveClass('st--attention')
    expect((await rowOf('Farm B')).getByText('88 / 88')).toHaveClass('st--normal')
    const farmD = await rowOf('Farm D')
    expect(farmD.getByText('+ Fajar Nugroho (invited)')).toBeInTheDocument()
    const farmE = await rowOf('Farm E')
    expect(farmE.getByText('No devices')).toBeInTheDocument()
    expect(farmE.getByText('Inactive')).toHaveClass('st--neutral')
    expect(screen.getByText('Farm E').closest('tr')).toHaveClass('is-muted')
    expect(screen.getByText('Inactive Farms are hidden from Farms Manager and Technical Manager screens.')).toBeInTheDocument()
    // Master data only (05 §5B)
    expect(screen.queryByText(/Warning|Attention|Biomass|mg\/L/)).not.toBeInTheDocument()
  })

  it('searches and filters by status', async () => {
    const { router } = open()
    await rowOf('Farm A')
    await userEvent.type(screen.getByRole('textbox', { name: 'Search Farm or location' }), 'west nusa')
    expect(screen.getAllByRole('row').slice(1).map((r) => (r as HTMLTableRowElement).cells[0].textContent)).toEqual(['Farm D', 'Farm E'])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'inactive')
    expect(screen.getAllByRole('row').slice(1).map((r) => (r as HTMLTableRowElement).cells[0].textContent)).toEqual(['Farm E'])
    expect(router.state.location.search).toBe('?q=west+nusa&status=inactive')
  })

  it('opens a Farm', async () => {
    const { router } = open()
    await userEvent.click((await rowOf('Farm C')).getByRole('button', { name: 'View Farm C' }))
    expect(router.state.location.pathname).toBe('/ad/farms/farm-c')
  })

  it('adds a Farm, which starts Inactive and opens its detail', async () => {
    const { router } = open('?addfarm=1')
    const drawer = within(await screen.findByRole('dialog', { name: 'Add farm' }))
    expect(drawer.getByText('Inactive', { selector: 'b' })).toBeInTheDocument()
    await userEvent.click(drawer.getByRole('button', { name: 'Add farm' }))
    expect(drawer.getByText('Enter a Farm name.')).toBeInTheDocument()
    expect(drawer.getByText('Enter the location.')).toBeInTheDocument()

    await userEvent.type(drawer.getByRole('textbox', { name: /Farm name/ }), 'Farm B')
    await userEvent.type(drawer.getByRole('textbox', { name: /Location/ }), 'Bima, West Nusa Tenggara')
    await userEvent.selectOptions(drawer.getByRole('combobox', { name: 'Time zone' }), 'Asia/Makassar')
    await userEvent.click(drawer.getByRole('button', { name: 'Add farm' }))
    expect(await drawer.findByText('A Farm with this name already exists')).toBeInTheDocument()

    await userEvent.clear(drawer.getByRole('textbox', { name: /Farm name/ }))
    await userEvent.type(drawer.getByRole('textbox', { name: /Farm name/ }), 'Farm F')
    await userEvent.click(drawer.getByRole('button', { name: 'Add farm' }))
    await screen.findByRole('heading', { level: 1 })
    expect(router.state.location.pathname).toMatch(/^\/ad\/farms\/farm-new-/)
  })

  it('lets a Technical Manager be assigned to an Inactive Farm being set up (AD-01)', async () => {
    renderApp('/ad/users?invite=1', { userId: 'u-yusuf' })
    const drawer = within(await screen.findByRole('dialog', { name: 'Invite user' }))
    await userEvent.click(drawer.getByRole('radio', { name: /Technical Manager/ }))
    expect(await drawer.findByRole('option', { name: 'Farm E · Sumbawa (Inactive)' })).toBeInTheDocument()
  })
})
