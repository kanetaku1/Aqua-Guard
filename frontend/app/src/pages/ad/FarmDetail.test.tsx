import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

/** AD-03 must match the wireframe sa-farms-ponds-detail.png (Farm Info) and prototype/screens/ad-farm-detail.html. */

const open = (farmId: string, query = '') => renderApp(`/ad/farms/${farmId}${query}`, { userId: 'u-yusuf' })
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section')!)

describe('AD-03 Farm Detail', () => {
  it('shows the Farm header, Farm Info and the assigned users', async () => {
    open('farm-a')
    expect(await screen.findByRole('heading', { level: 1, name: /Farm A/ })).toHaveTextContent('Active')
    expect(screen.getByText('Technical Manager: Sari Wijaya')).toBeInTheDocument()
    expect(screen.getByText('Updated 2 Sep 2026 by Yusuf Rahman')).toBeInTheDocument()
    // One device offline → Devices tab badge
    expect(await within(screen.getByRole('link', { name: /Devices/ })).findByText('1')).toBeInTheDocument()

    const info = await card('Farm information')
    expect(info.getByRole('textbox', { name: /Farm name/ })).toHaveValue('Farm A')
    expect(info.getByRole('switch', { name: 'Status' })).toHaveAttribute('aria-checked', 'true')
    expect(info.getByText('Active — visible to Farms Manager and Technical Manager')).toBeInTheDocument()
    expect(info.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    const users = await card('Assigned users')
    expect(users.getByText('Sari Wijaya')).toBeInTheDocument()
    expect(users.getByRole('link', { name: /Users/ })).toHaveAttribute('href', '/ad/users?farm=farm-a')
  })

  it('confirms before setting an active Farm to Inactive', async () => {
    open('farm-a')
    const info = await card('Farm information')
    await userEvent.click(info.getByRole('switch', { name: 'Status' }))
    expect(info.getByText('Inactive — hidden from Farms Manager and Technical Manager')).toBeInTheDocument()
    await userEvent.click(info.getByRole('button', { name: 'Save changes' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Set Farm A to Inactive?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Set Inactive' }))
    expect(await screen.findByText('Farm A saved')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /Farm A/ })).toHaveTextContent('Inactive')
  })

  it('says what is missing when activating a Farm that is not set up', async () => {
    open('farm-e')
    const info = await card('Farm information')
    expect(screen.getByText('No Technical Manager')).toBeInTheDocument()
    await userEvent.click(info.getByRole('switch', { name: 'Status' }))
    expect(info.getByText('Not set up yet: no Pond in operation · no devices · no active Technical Manager. You can still activate the Farm.')).toBeInTheDocument()
  })

  it('lists the Ponds with totals and adds one', async () => {
    open('farm-a', '?tab=ponds')
    const ponds = await card('Ponds')
    expect(await ponds.findByText('9 Ponds · 3.8 ha · 8 in operation')).toBeInTheDocument()
    const pond09 = within(ponds.getByText('Pond 09').closest('tr')!)
    expect(pond09.getByText('Fallow')).toBeInTheDocument()
    const total = within(ponds.getByText('8 in operation · 1 fallow').closest('tr')!)
    expect(total.getByText('48')).toBeInTheDocument()
    expect(total.getByText('23')).toBeInTheDocument()

    await userEvent.click(ponds.getByRole('button', { name: 'Add pond' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Add pond' }))
    await userEvent.type(drawer.getByRole('textbox', { name: /Pond name/ }), 'Pond 09')
    await userEvent.type(drawer.getByRole('textbox', { name: /Area/ }), '0.5')
    await userEvent.click(drawer.getByRole('button', { name: 'Save pond' }))
    expect(await drawer.findByText('This Farm already has a Pond with this name')).toBeInTheDocument()

    await userEvent.clear(drawer.getByRole('textbox', { name: /Pond name/ }))
    await userEvent.type(drawer.getByRole('textbox', { name: /Pond name/ }), 'Pond 10')
    await userEvent.click(drawer.getByRole('button', { name: 'Save pond' }))
    expect(await screen.findByText('Pond 10 added')).toBeInTheDocument()
    expect(await ponds.findByText('10 Ponds · 4.3 ha · 9 in operation')).toBeInTheDocument()
  })

  it('lists devices without values and warns about the offline one', async () => {
    open('farm-a', '?tab=devices&pond=farm-a-pond-02')
    expect(await screen.findByText('A-P08-TRB (Turbidity, Pond 08) since 28 Sep 22:10')).toBeInTheDocument()
    const devices = await card('Devices')
    expect(await devices.findByText('71 devices · 48 sensors · 23 actuators')).toBeInTheDocument()
    expect(await devices.findByText('Showing 11 devices in Pond 02')).toBeInTheDocument()
    expect(within(devices.getByText('A-P02-AER1').closest('tr')!).getByText(/Aerator · Paddlewheel · 2 HP/)).toBeInTheDocument()
    expect(devices.queryByText(/mg\/L \d|°C \d/)).not.toBeInTheDocument()

    await userEvent.selectOptions(devices.getByRole('combobox', { name: 'Pond' }), '')
    await userEvent.selectOptions(devices.getByRole('combobox', { name: 'Connection' }), 'offline')
    expect(await devices.findByText('Showing 1–1 of 1')).toBeInTheDocument()
    expect(within(devices.getByText('A-P08-TRB').closest('tr')!).getByText('Offline')).toHaveClass('st--offline')
  })

  it('adds a sensor, which waits for its first reading', async () => {
    open('farm-a', '?tab=devices&pond=farm-a-pond-08')
    const devices = await card('Devices')
    await userEvent.click(await devices.findByRole('button', { name: 'Add device' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Add device' }))
    expect(drawer.getByRole('combobox', { name: /Pond/ })).toHaveDisplayValue('Pond 08')
    await userEvent.type(drawer.getByRole('textbox', { name: /Device ID/ }), 'a-p08-trb')
    await userEvent.click(drawer.getByRole('button', { name: 'Add device' }))
    expect(drawer.getByText('Choose what the sensor measures.')).toBeInTheDocument()
    await userEvent.selectOptions(drawer.getByRole('combobox', { name: /Measures/ }), 'turbidity')
    await userEvent.click(drawer.getByRole('button', { name: 'Add device' }))
    expect(await drawer.findByText('This Device ID is already registered')).toBeInTheDocument()

    await userEvent.type(drawer.getByRole('textbox', { name: /Device ID/ }), '2')
    await userEvent.click(drawer.getByRole('button', { name: 'Add device' }))
    expect(await screen.findByText('A-P08-TRB2 added')).toBeInTheDocument()
    const row = within((await devices.findByText('A-P08-TRB2')).closest('tr')!)
    expect(row.getByText('Waiting for first reading')).toBeInTheDocument()
    // Not counted as offline: the warning still names one device
    expect(screen.getByText('1 device offline:')).toBeInTheDocument()
  })

  it('cannot change a Device ID when editing', async () => {
    open('farm-a', '?tab=devices&device=A-P02-DO&pond=farm-a-pond-02')
    const drawer = within(await screen.findByRole('dialog', { name: 'A-P02-DO' }))
    expect(drawer.getByRole('textbox', { name: /Device ID/ })).toBeDisabled()
    await userEvent.selectOptions(drawer.getByRole('combobox', { name: /Pond/ }), 'farm-a-pond-09')
    await userEvent.click(drawer.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('A-P02-DO saved')).toBeInTheDocument()
  })
})
