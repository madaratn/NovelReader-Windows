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
  await expect(page.locator('.readersettings')).toHaveCount(0)
  // Scroll the text like a reader would: pointer over the chapter, then the wheel.
  await page.locator('.readercontent p').nth(3).hover()
  await page.mouse.wheel(0, 1500)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await expect(page.locator('.readerbar')).toHaveClass(/hidden/)
  await page.waitForTimeout(600) // position is saved after scrolling stops
  const y = await page.evaluate(() => scrollY)
  await page.reload()
  await page.locator('.lib-resume .primary').click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y - 20)
  expect(await page.evaluate(() => scrollY)).toBeLessThan(y + 20)
})

test('scrolling right after a chapter change still hides the toolbar', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.locator('.readercontent p').nth(3).hover()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await page.mouse.wheel(0, 1500) // immediately, like a fast reader
  await expect(page.locator('.readerbar')).toHaveClass(/hidden/)
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
  await expect(page.locator('.tts-play')).toHaveAttribute('aria-label', 'Pause')
  await page.locator('.tts-close').click()
  await expect(page.locator('.tts-current')).toHaveCount(0)
})

test('read aloud: word highlight, natural voices first, sleep timer', async ({ page }) => {
  await fakeSpeech(page)
  await page.addInitScript(() => { (window as any).__ttsHold = true })
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.locator('.tts-toggle').click()
  await expect(page.locator('.tts-opts select').nth(1).locator('option').nth(1)).toHaveText('Microsoft Denise Online (Natural) (fr-FR)')
  await page.locator('.tts-play').click()
  // The engine reports the 2nd word: it gets highlighted, without changing the page
  const word = await page.evaluate(() => { const w = window as any; const text = w.__cur.text as string; const i = text.indexOf(' ') + 1; const len = text.slice(i).split(' ')[0].length; w.__cur.onboundary({ name: 'word', charIndex: i, charLength: len }); const r = (CSS as any).highlights.get('tts-word'); return { hl: r ? [...r][0].toString() : '', expected: text.slice(i, i + len) } })
  expect(word.hl).toBe(word.expected)
  // Sleep timer at the end of the chapter: stops after the last paragraph
  await page.locator('.tts-opts select').nth(2).selectOption('chapter-end')
  const total = Number((await page.locator('.tts-pos').innerText()).match(/of (\d+)/)![1])
  await page.locator('.readercontent p').nth(total - 2).click()
  await page.evaluate(() => { const w = window as any; w.__ttsHold = false; w.__cur.onend() })
  await expect(page.locator('.tts-err')).toHaveText('Sleep timer: reading stopped.')
  await expect(page.locator('.tts-play')).toHaveAttribute('aria-label', 'Read aloud')
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 1: The Road')
})

test('translate a chapter, back to the original, always translate this novel', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  const first = (await page.locator('.readercontent p').first().innerText()).trim()
  await page.locator('.translate-toggle').click()
  await expect(page.locator('.readercontent p').first()).toHaveText('[en] ' + first.toUpperCase())
  await expect(page.locator('.readercontent.translated')).toHaveCount(1)
  await page.locator('.translate-toggle').click()
  await expect(page.locator('.readercontent p').first()).toHaveText(first)
  // Always translate, into French: applies now and to the next chapter
  await page.locator('.translate-more').click()
  await page.locator('.translate-menu select').selectOption('fr')
  await page.locator('.translate-menu input[type=checkbox]').check()
  await expect(page.locator('.readercontent p').first()).toHaveText('[fr] ' + first.toUpperCase())
  await page.locator('.translate-more').click()
  await page.locator('.readercontent h1').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await expect(page.locator('.readercontent p').first()).toHaveText(/^\[fr\] /)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('translateNovels') || '{}'))).toEqual({ n1: 'fr' })
})

test('scripts hidden in chapter HTML never run (content security policy)', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__chapterOverride = '<p>Safe text</p><img src="data:x" onerror="window.__xss=1"><p onclick="window.__xss=2">Click me</p><script>window.__xss=3</script>' })
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await expect(page.locator('.readercontent')).toContainText('Safe text')
  await page.locator('.readercontent p', { hasText: 'Click me' }).click()
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined()
})

test('security: a chapter keeps its text and pictures only (no script, frame, form, handler, javascript: link)', async ({ page }) => {
  await open(page, { library: LIB, reading: { mol: { index: 3 } } })
  await page.evaluate(() => {
    const w = window as any
    w.novelReader.parseChapter = async () => '<p id="keep">Chapter text <b>bold</b></p><img id="pic" src="https://img.test/a.jpg" onerror="window.__pwned=1">'
      + '<script>window.__pwned=1</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name="x"></form>'
      + '<a id="bad" href="javascript:window.__pwned=1">click</a><a id="good" href="https://site.test/next">next</a><svg onload="window.__pwned=1"></svg><div style="background:url(https://evil.test/t)">x</div>'
  })
  await page.locator('.libcard .primary').click()
  const art = page.locator('.readercontent')
  await expect(art.locator('#keep')).toContainText('Chapter text bold')
  await expect(art.locator('#pic')).toHaveCount(1)
  expect(await art.locator('#pic').getAttribute('onerror')).toBeNull()
  await expect(art.locator('script, iframe, form, input, svg')).toHaveCount(0)
  expect(await art.locator('#bad').getAttribute('href')).toBeNull()
  expect(await art.locator('#good').getAttribute('href')).toBe('https://site.test/next')
  expect(await art.locator('div[style]').count()).toBe(0)
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined()
})

test('a technical error is said plainly, with what to do; the original text stays under "Technical details"', async ({ page }) => {
  await open(page, { library: LIB, reading: { mol: { index: 3 } } })
  await page.evaluate(() => { (window as any).novelReader.parseChapter = async () => { throw new Error("Error invoking remote method 'plugin:parseChapter': Error: getaddrinfo ENOTFOUND site1.test") } })
  await page.locator('.libcard .primary').click()
  const toast = page.locator('.search-toast.error')
  await expect(toast.locator('.notice-text > span')).toHaveText('Could not load chapter: This site no longer exists or has moved. Use another source.')
  await toast.locator('summary').click()
  await expect(toast.locator('pre')).toContainText('ENOTFOUND site1.test')
})

test('empty library: one sentence and one next step', async ({ page }) => {
  await open(page, { library: [] })
  const box = page.locator('.empty-state')
  await expect(box.locator('h2')).toHaveText('Your library is empty')
  await expect(box.locator('button')).toHaveCount(1)
  await box.getByRole('button', { name: 'Search a title' }).click()
  await expect(page.locator('main h1')).toHaveText('Find a title everywhere')
})
