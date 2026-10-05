import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** AD-01 must match the wireframe sa-users.png and 05 §5B AD-01. */

const open = (query = '') => renderApp(`/ad/users${query}`, { userId: 'u-yusuf' })
const rows = async () => (await screen.findAllByRole('row')).slice(1) as HTMLTableRowElement[]
const rowOf = async (name: string) => within((await screen.findByText(name, { selector: '.cell-main, .cell-main *' })).closest('tr')!)

describe('AD-01 Users', () => {
  it('lists users with Role, Farm, status and last sign-in', async () => {
    open()
    expect(await screen.findByText('10 users · 7 active · 2 invited · 1 deactivated')).toBeInTheDocument()
    const list = await rows()
    expect(list.map((r) => r.cells[0].querySelector('.cell-main')!.textContent)).toEqual([
      'Yusuf Rahman (you)',
      'Nadia Kurnia',
      'Hendra Kusuma',
      'Rina Hartono',
      'Sari Wijaya',
      'Budi Santoso',
      'Dewi Lestari',
      'Agus Pratama',
      'Fajar Nugroho',
      'Eko Wibowo',
    ])
    const rina = await rowOf('Rina Hartono')
    expect(rina.getByText('All Farms')).toBeInTheDocument()
    expect(rina.getByText('Invited')).toHaveClass('st--progress')
    expect(rina.getByText('Invited 28 Sep · expires 1 Oct')).toBeInTheDocument()
    expect((await rowOf('Sari Wijaya')).getByText('29 Sep 09:20')).toBeInTheDocument()
    expect((await screen.findByText('Eko Wibowo')).closest('tr')).toHaveClass('is-muted')
    expect(screen.getByText('Showing 1–10 of 10')).toBeInTheDocument()
    // No business data on SA screens (05 §5B)
    expect(screen.queryByText(/mg\/L|Biomass|Alert/)).not.toBeInTheDocument()
  })

  it('filters by Role, status and Farm', async () => {
    open()
    await rows()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'technical_manager')
    await screen.findByText('Showing 1–6 of 6')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Farm' }), 'farm-d')
    await screen.findByText('Showing 1–2 of 2')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'invited')
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument()
    expect((await rows())[0]).toHaveTextContent('Fajar Nugroho')
  })

  it('invites a Technical Manager, who needs a Farm', async () => {
    const { router } = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }))
    expect(router.state.location.search).toBe('?invite=1')
    const drawer = within(await screen.findByRole('dialog', { name: 'Invite user' }))
    await userEvent.type(drawer.getByRole('textbox', { name: /Full name/ }), 'Wulan Sari')
    await userEvent.type(drawer.getByRole('textbox', { name: /Email/ }), 'wulan.sari@nusantarashrimp.co.id')
    await userEvent.click(drawer.getByRole('radio', { name: /Technical Manager/ }))
    await userEvent.click(drawer.getByRole('button', { name: 'Send invitation' }))
    expect(drawer.getByText('Choose the Farm this Technical Manager works in.')).toBeInTheDocument()

    await userEvent.selectOptions(drawer.getByRole('combobox', { name: /Assigned Farm/ }), 'farm-c')
    await userEvent.click(drawer.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Invitation sent to wulan.sari@nusantarashrimp.co.id')).toBeInTheDocument()
    expect(await screen.findByText('11 users · 7 active · 3 invited · 1 deactivated')).toBeInTheDocument()
    expect((await rowOf('Wulan Sari')).getByText('Farm C')).toBeInTheDocument()
  })

  it('shows the server error when the email is already used', async () => {
    open('?invite=1')
    const drawer = within(await screen.findByRole('dialog', { name: 'Invite user' }))
    await userEvent.type(drawer.getByRole('textbox', { name: /Full name/ }), 'Sari Again')
    await userEvent.type(drawer.getByRole('textbox', { name: /Email/ }), 'sari.wijaya@nusantarashrimp.co.id')
    await userEvent.click(drawer.getByRole('radio', { name: /Farms Manager/ }))
    await userEvent.click(drawer.getByRole('button', { name: 'Send invitation' }))
    expect(await drawer.findByText('A user with this email already exists')).toBeInTheDocument()
  })

  it('warns that Farm A loses its only Technical Manager, then deactivates', async () => {
    open('?user=u-sari')
    const drawer = within(await screen.findByRole('dialog', { name: 'Sari Wijaya' }))
    expect(drawer.getByText('2 Jun 2026 by Yusuf Rahman')).toBeInTheDocument()
    expect(drawer.getByRole('combobox', { name: /Assigned Farm/ })).toHaveDisplayValue('Farm A · East Java')

    await userEvent.click(drawer.getByRole('button', { name: 'Deactivate user' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Deactivate Sari Wijaya?' }))
    expect(dialog.getByText('Farm A will have no active Technical Manager. Assign another user before deactivating.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Deactivate' })).toHaveClass('btn--danger')
    await userEvent.click(dialog.getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('Sari Wijaya deactivated')).toBeInTheDocument()
    expect(await screen.findByText('10 users · 6 active · 2 invited · 2 deactivated')).toBeInTheDocument()
    // The drawer stays open and now offers Reactivate
    expect(await within(await screen.findByRole('dialog', { name: 'Sari Wijaya' })).findByRole('button', { name: 'Reactivate user' })).toBeInTheDocument()
  })

  it('changes a Role: moving to Farms Manager clears the Farm', async () => {
    open('?user=u-budi')
    const drawer = within(await screen.findByRole('dialog', { name: 'Budi Santoso' }))
    expect(drawer.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.selectOptions(drawer.getByRole('combobox', { name: /Role/ }), 'farms_manager')
    expect(drawer.queryByRole('combobox', { name: /Assigned Farm/ })).not.toBeInTheDocument()
    expect(drawer.getByText('Farm B will have no active Technical Manager after this change.')).toBeInTheDocument()
    await userEvent.click(drawer.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Changes to Budi Santoso saved')).toBeInTheDocument()
    const budi = await rowOf('Budi Santoso')
    expect(await budi.findByText('Farms Manager')).toBeInTheDocument()
    expect(budi.getByText('All Farms')).toBeInTheDocument()
  })

  it('does not let you change your own Role or deactivate yourself', async () => {
    open('?user=u-yusuf')
    const drawer = within(await screen.findByRole('dialog', { name: 'Yusuf Rahman' }))
    expect(drawer.getByRole('combobox', { name: /Role/ })).toBeDisabled()
    expect(drawer.getByText('You cannot change your own Role.')).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: 'Deactivate user' })).toBeDisabled()
    expect(drawer.getByText('You cannot deactivate your own account.')).toBeInTheDocument()
  })

  it('resends an invitation', async () => {
    open('?user=u-rina')
    const drawer = within(await screen.findByRole('dialog', { name: 'Rina Hartono' }))
    expect(drawer.queryByRole('button', { name: 'Send password reset' })).not.toBeInTheDocument()
    await userEvent.click(drawer.getByRole('button', { name: 'Resend invitation' }))
    expect(await screen.findByText('Invitation sent again to rina.hartono@nusantarashrimp.co.id')).toBeInTheDocument()
  })
})
