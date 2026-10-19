import { expect, test } from '@playwright/test'

const base = '/podcast-web/'

test('repository-base homepage loads its assets and uses base-aware navigation', async ({ page }) => {
  const response = await page.goto(base)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: /孙宇晨/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /向 AI 提问/ })).toHaveAttribute('href', `${base}agent`)
  await expect(page.getByRole('link', { name: /阅读访谈稿/ })).toHaveAttribute('href', `${base}transcript`)
  const visibleImages = page.locator('.stage8-hero-visual img:visible')
  await expect(visibleImages.first()).toBeVisible()
  await expect.poll(() => visibleImages.first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
})

test('direct Agent route is restored by the real 404 fallback and stays offline-safe', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/api/')) apiRequests.push(request.url()) })
  const response = await page.goto(`${base}agent`)
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: '问访谈，也问怎么做' })).toBeVisible()
  await expect(page.getByText('在线问答服务尚未连接。')).toBeVisible()
  await expect(page.getByRole('button', { name: '服务未连接' })).toBeDisabled()
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
  await page.getByRole('button', { name: '邮箱登录' }).click()
  await expect(page.getByText(/暂时不能登录、查询额度或兑换邀请码/)).toBeVisible()
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeDisabled()
  await expect(page.getByText(/剩余 \d+ 次/)).toHaveCount(0)
  expect(apiRequests).toEqual([])
})

test('direct transcript route renders the static authoritative copy without requesting audio', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/api/')) apiRequests.push(request.url()) })
  const response = await page.goto(`${base}transcript`)
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: '完整访谈稿' })).toBeVisible()
  await expect(page.locator('.transcript-turn')).toHaveCount(682)
  await expect(page.locator('audio')).not.toHaveAttribute('src', /.+/)
  await expect(page.locator('.audio-state')).toHaveText('不可用')
  expect(apiRequests).toEqual([])
})

test('refresh keeps the friendly route and mobile layout does not overflow', async ({ page }, testInfo) => {
  await page.goto(`${base}agent`)
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`${base}agent$`))
  await expect(page.getByRole('heading', { name: '问访谈，也问怎么做' })).toBeVisible()
  if (testInfo.project.name === 'mobile-chromium') {
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1)
    await expect(page.getByRole('button', { name: 'AI 问答' })).toBeVisible()
    await expect(page.getByRole('button', { name: '逐字稿搜索' })).toBeVisible()
  }
})
