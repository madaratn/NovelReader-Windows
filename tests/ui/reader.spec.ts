import { test, expect } from '@playwright/test'
import { open, novel, fakeSpeech } from './helpers'

const LIB = [novel('mol', 'Mother of Learning', 1534)]

test('chapter page opens on the current chapter with read ones marked', async ({ page }) => {
  await open(page, { library: LIB, reading: { mol: { index: 249 } } })
  await page.locator('.libtitle').click()
  await expect(page.locator('.chapterrow.read')).toHaveCount(249)
  const current = page.locator('.chapterrow.current')
  await expect(current).toContainText('Reading · Ch. 250')
  await expect(current).toBeInViewport()
  await page.fill('.chaptertools input', '1200')
  await expect(page.locator('.chapterrow .chaptername')).toHaveText(['Chapter 1200: The Road'])
})

test('reader: settings, keyboard, auto-hiding bar, exact resume', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 1: The Road')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await page.keyboard.press('+')
  await expect(page.locator('.readercontent')).toHaveCSS('font-size', '21px')
  await page.locator('.readersettings-btn').click()
  await page.locator('.rs-swatch.sw-sepia').click()
  await expect(page.locator('.readerpage')).toHaveClass(/rtheme-sepia/)
  await page.keyboard.press('Escape')
  await page.mouse.wheel(0, 1500)
  await expect(page.locator('.readerbar')).toHaveClass(/hidden/)
  await page.waitForTimeout(600) // position is saved after scrolling stops
  const y = await page.evaluate(() => scrollY)
  await page.reload()
  await page.locator('.lib-resume .primary').click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y - 20)
  expect(await page.evaluate(() => scrollY)).toBeLessThan(y + 20)
})

test('chapter text is not rebuilt while scrolling (React 19 innerHTML regression)', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.evaluate(() => { (window as any).__mut = 0; new MutationObserver(m => { (window as any).__mut += m.filter(r => r.type === 'childList').length }).observe(document.querySelector('.readercontent')!, { childList: true, subtree: true }) })
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(60) }
  expect(await page.evaluate(() => (window as any).__mut)).toBe(0)
})

test('read aloud: highlight, pause, click to jump, continues to next chapter', async ({ page }) => {
  await fakeSpeech(page)
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.locator('.tts-toggle').click()
  await page.locator('.tts-play').click()
  await expect(page.locator('.readercontent .tts-current')).toHaveCount(1)
  await page.locator('.tts-play').click() // pause
  const paused = await page.locator('.tts-pos').innerText()
  await page.waitForTimeout(200)
  await expect(page.locator('.tts-pos')).toHaveText(paused)
  await page.locator('.readercontent p').nth(19).click()
  await expect(page.locator('.tts-pos')).toHaveText('Paragraph 21 of 41')
  await page.locator('.tts-play').click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road', { timeout: 10_000 })
  await expect(page.locator('.tts-play')).toHaveText('❚❚')
  await page.locator('.tts-close').click()
  await expect(page.locator('.tts-current')).toHaveCount(0)
})
