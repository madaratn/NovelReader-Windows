import { test, expect } from '@playwright/test'
import { open, novel, nav, setup } from './helpers'

test('settings show the installed version and a manual update check', async ({ page }) => {
  await open(page)
  await expect(page.locator('.sidebar .version')).toHaveText('Windows · v0.2.0')
  await nav(page, 'Settings')
  await expect(page.locator('.settings-block', { hasText: 'Updates' })).toContainText('Installed version: 0.2.0')
  await page.locator('button', { hasText: 'Check for updates' }).click()
  await expect(page.locator('.settings-block', { hasText: 'Updates' })).toContainText('NovelReader is up to date.')
})

test('a downloaded update shows a banner that restarts the app', async ({ page }) => {
  await open(page)
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'downloading', version: '0.2.0', next: '0.3.0', percent: 40 }))
  await expect(page.locator('.update-banner')).toHaveCount(0)
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'ready', version: '0.2.0', next: '0.3.0' }))
  await expect(page.locator('.update-banner')).toContainText('NovelReader 0.3.0 is ready. It installs by itself when you close the app.')
  await page.locator('.update-banner button', { hasText: 'Later' }).click()
  await expect(page.locator('.update-banner')).toHaveCount(0)
  await nav(page, 'Settings')
  const block = page.locator('.settings-block', { hasText: 'Updates' })
  await expect(block).toContainText('Version 0.3.0 is ready: it installs when you close NovelReader.')
  await expect(block).toContainText('nothing to uninstall')
  // Idle install is on by default and the app is told; turning it off is passed on
  expect(await page.evaluate(() => (window as any).__busy)).toEqual({ busy: false, auto: true })
  await block.getByLabel(/idle for 15 minutes/).uncheck()
  expect(await page.evaluate(() => (window as any).__busy)).toEqual({ busy: false, auto: false })
  await block.getByRole('button', { name: 'Restart now' }).click()
  expect(await page.evaluate(() => (window as any).__installed)).toBe(true)
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'installing', version: '0.2.0', next: '0.3.0' }))
  await expect(page.locator('.update-banner')).toContainText('NovelReader will reopen by itself')
})

test('after an update installed itself, a one-time "updated" message is shown', async ({ page }) => {
  await open(page, { storage: { lastRunVersion: '0.1.0' } })
  await expect(page.locator('.update-banner')).toContainText('NovelReader has been updated to 0.2.0.')
  await page.locator('.update-banner').getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.update-banner')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.sidebar .version')).toBeVisible()
  await expect(page.locator('.update-banner')).toHaveCount(0)
})

test('new chapters found in the background raise a Windows notification that opens the library', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('__background', '1'))
  await open(page, { library: [novel('mol', 'Mother of Learning', 108), novel('boc', 'Beware of Chicken', 40)], newChapters: { mol: 110 } })
  await nav(page, 'Settings')
  await nav(page, 'Library')
  await page.locator('.lib-update').click()
  await expect(page.locator('.lib-update-status')).toContainText('1 novel has new chapters.')
  expect(await page.evaluate(() => (window as any).__notes)).toEqual([{ title: '1 novel has new chapters.', body: 'Mother of Learning' }])
  await nav(page, 'Sources')
  await page.evaluate(() => (window as any).__lastNote.onclick())
  await expect(page.locator('main h1')).toHaveText('Your Library')
  expect(await page.evaluate(() => (window as any).__focused)).toBe(1)
})

test('no notification when it is turned off in Settings', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('__background', '1'))
  await open(page, { library: [novel('mol', 'Mother of Learning', 108)], newChapters: { mol: 110 } })
  await nav(page, 'Settings')
  await page.locator('.settings-check', { hasText: 'new chapters are found' }).locator('input').uncheck()
  await nav(page, 'Library')
  await page.locator('.lib-update').click()
  await expect(page.locator('.lib-update-status')).toContainText('1 novel has new chapters.')
  expect(await page.evaluate(() => (window as any).__notes.length)).toBe(0)
})

test('library cards keep their actions tidy (no stray wrapped button)', async ({ page }) => {
  await open(page, { library: [novel('mol', 'Mother of Learning', 108)], reading: { mol: { index: 3 } } })
  const card = page.locator('.libcard').first()
  const primary = await card.locator('.libraryactions .primary').boundingBox()
  const select = await card.locator('.shelfselect').boundingBox()
  const remove = await card.locator('.removebtn').boundingBox()
  expect(Math.abs(select!.y - remove!.y)).toBeLessThan(2)       // shelf + remove on one row
  expect(select!.y).toBeGreaterThan(primary!.y + primary!.height - 1) // under the main action
})

test('profiles: switcher in the sidebar, create, rename, switch and remove in Settings', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__pf = { list: [{ id: 'default', name: '', color: '#8b7cff' }], current: 'default', switched: '' }
    const patch = () => Object.assign(w.novelReader, {
      profileList: async () => ({ list: w.__pf.list.map((p: any) => ({ ...p })), current: w.__pf.current }),
      profileCreate: async (name: string) => { const p = { id: 'p' + w.__pf.list.length, name, color: '#3fb37f' }; w.__pf.list.push(p); return p },
      profileRename: async (id: string, name: string) => { w.__pf.list.find((p: any) => p.id === id).name = name; return {} },
      profileColor: async () => ({}),
      profileRemove: async (id: string) => { w.__pf.list = w.__pf.list.filter((p: any) => p.id !== id); return true },
      profileSwitch: async (id: string) => { w.__pf.switched = id; return true }
    })
    const iv = setInterval(() => { if (w.novelReader) { patch(); clearInterval(iv) } }, 0)
  })
  await open(page)
  await expect(page.locator('.pf-current')).toContainText('Profiles')
  await page.locator('.pf-current').click()
  await page.getByRole('menuitem', { name: /Add or manage profiles/ }).click()
  const panel = page.locator('.profiles-panel')
  await expect(panel.locator('.pf-row')).toHaveCount(1)
  await panel.locator('.pf-add input').fill('Sara')
  await panel.getByRole('button', { name: 'Add a profile' }).click()
  await expect(panel.locator('.pf-row')).toHaveCount(2)
  await expect(panel).toContainText('Profile “Sara” created')
  // Name the main profile
  await panel.locator('.pf-row').first().locator('input').fill('Ali')
  await panel.locator('.pf-add input').click()
  await expect(page.locator('.pf-current')).toContainText('Ali')
  // Switch from the sidebar menu
  await page.locator('.pf-current').click()
  await page.getByRole('menuitemradio', { name: /Sara/ }).click()
  expect(await page.evaluate(() => (window as any).__pf.switched)).toBe('p1')
  // Remove (two clicks)
  await panel.locator('.pf-row', { hasText: '' }).nth(1).getByRole('button', { name: 'Remove' }).click()
  await panel.getByRole('button', { name: 'Delete with its data' }).click()
  await expect(panel.locator('.pf-row')).toHaveCount(1)
})

test('interface update without closing: offered, applied with the button, or by itself when the app is not used', async ({ page }) => {
  await page.clock.install()
  await setup(page, {})
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__ui = { ok: 0, apply: 0 }
    w.novelReader = { ...base,
      uiOk: async () => { w.__ui.ok++; return true },
      uiStatus: async () => ({ state: 'ready', version: '0.3.0' }),
      onUiStatus: () => () => {},
      uiApply: async () => { w.__ui.apply++; return true } }
  })
  await page.goto('/')
  const banner = page.locator('.update-banner')
  await expect(banner).toContainText('NovelReader 0.3.0 is ready. It applies by itself when you are not using the app, without closing it.')
  expect(await page.evaluate(() => (window as any).__ui.ok)).toBe(1)
  // The full update of the same version does not ask for a restart
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'ready', version: '0.2.0', next: '0.3.0' }))
  await expect(banner).not.toContainText('Restart now')
  await banner.getByRole('button', { name: 'Update now (1 second)' }).click()
  expect(await page.evaluate(() => (window as any).__ui.apply)).toBe(1)
  // Still in use: nothing happens by itself
  await page.clock.runFor(16000)
  expect(await page.evaluate(() => (window as any).__ui.apply)).toBe(1)
  // By itself: the app goes to the background with nothing playing
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }) })
  await page.clock.runFor(16000)
  await expect.poll(() => page.evaluate(() => (window as any).__ui.apply)).toBe(2)
})

test('settings: videos on the iPhone through this PC (turn on, link to type, new code, turn off)', async ({ page }) => {
  await setup(page, {})
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    const st = { enabled: false, port: 0, code: 'abcdefghjk', addresses: [] as string[], link: '', lastSeen: 0, lastFrom: '' }
    const on = () => Object.assign(st, { enabled: true, port: 4580, addresses: ['192.168.1.5:4580'], link: '192.168.1.5:4580/' + st.code })
    w.novelReader = { ...base,
      shareStatus: async () => ({ ...st }),
      shareEnable: async () => ({ ...on() }),
      shareRenew: async () => { st.code = 'mnpqrstuvw'; return { ...on() } },
      shareDisable: async () => ({ ...Object.assign(st, { enabled: false, port: 0, addresses: [], link: '' }) }) }
  })
  await page.goto('/')
  await nav(page, 'Settings')
  const block = page.locator('.pc-share')
  await expect(block).toContainText('Phone link')
  await expect(page.locator('.pc-link')).toHaveCount(0)
  await expect(block.locator('code')).toHaveCount(0)
  await block.getByRole('button', { name: 'Turn on the phone link' }).click()
  await expect(block.locator('.pc-share-link')).toHaveText('192.168.1.5:4580/abcdefghjk')
  // The QR code says the same link (read back from its picture, as a phone camera would).
  const px = await block.locator('svg.qr').evaluate(async (svg: SVGElement) => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg)); await img.decode()
    const c = document.createElement('canvas'); c.width = c.height = 360; const x = c.getContext('2d')!; x.drawImage(img, 0, 0, 360, 360)
    return Array.from(x.getImageData(0, 0, 360, 360).data)
  })
  const jsQR = (await import('jsqr')).default as any
  expect((jsQR.default || jsQR)(Uint8ClampedArray.from(px), 360, 360)?.data).toBe('192.168.1.5:4580/abcdefghjk')
  await block.getByRole('button', { name: 'New code' }).click()
  await expect(block.locator('.pc-share-link')).toHaveText('192.168.1.5:4580/mnpqrstuvw')
  await block.getByRole('button', { name: 'Turn off' }).click()
  await expect(block.getByRole('button', { name: 'Turn on the phone link' })).toBeVisible()
})
