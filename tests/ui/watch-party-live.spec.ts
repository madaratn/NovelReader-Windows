import { test, expect, BrowserContext } from '@playwright/test'
import { setup } from './helpers'

// Real connection through the public PeerJS server (needs internet): run with LIVE_PEER=1.
test.skip(!process.env.LIVE_PEER, 'needs internet (LIVE_PEER=1)')

async function pc(context: BrowserContext) {
  const page = await context.newPage()
  await setup(page, { storage: { mode: 'anime', 'lastPage:anime': 'anime' } })
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  return page
}
test('live watch party over PeerJS: create, join, chat both ways', async ({ browser }) => {
  test.setTimeout(90_000)
  // Two separate browser profiles, like two PCs.
  const ca = await browser.newContext(), cb = await browser.newContext()
  const a = await pc(ca), b = await pc(cb)
  await a.locator('.wp-open').click()
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 })
  const code = await a.locator('.wp-code b').innerText()
  await b.locator('.wp-open').click()
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code)
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-members')).toHaveText('2 people: Ali, Sara', { timeout: 30_000 })
  await b.locator('.wp-say input').fill('hello from B')
  await b.locator('.wp-say input').press('Enter')
  await expect(a.locator('.wp-chat')).toContainText('Sara hello from B', { timeout: 15_000 })
  await a.locator('.wp-say input').fill('hi from A')
  await a.locator('.wp-say input').press('Enter')
  await expect(b.locator('.wp-chat')).toContainText('Ali hi from A', { timeout: 15_000 })
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await expect(b.locator('.wp-error')).toHaveText('The host closed the watch party.', { timeout: 15_000 })
})
