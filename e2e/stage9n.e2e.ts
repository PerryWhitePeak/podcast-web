import { expect, test, type Page, type Route } from '@playwright/test'

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

async function mockStage9N(page: Page) {
  let loggedIn = false
  let available = 3
  let totalGranted = 3
  let csrf = 'csrf-test-token'
  let chatCalls = 0

  const account = () => ({
    email: 'reader@example.com', role: 'user', available, reserved: 0,
    consumed: totalGranted - available, total_granted: totalGranted, csrf_token: csrf,
  })
  await page.route('**/api/health', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'ok', schema_version: '1.0', canonical_source_current: true,
      keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'offline',
      llm_provider: 'mock', llm_configured: true, auth_enabled: true, auth_configured: true,
      audio_available: false, audio_filename: null, audio_media_type: null, audio_duration_seconds: null,
    }),
  }))
  await page.route('**/api/auth/me', (route: Route) => {
    if (!loggedIn) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'AUTH_REQUIRED' } }) })
    csrf = `${csrf}-r`
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account()) })
  })
  await page.route('**/api/auth/otp/request', (route: Route) => route.fulfill({
    status: 202, contentType: 'application/json',
    body: JSON.stringify({ status: 'accepted', message: '如果该邮箱可以接收邮件，验证码将很快送达。' }),
  }))
  await page.route('**/api/auth/otp/verify', (route: Route) => {
    loggedIn = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account()) })
  })
  await page.route('**/api/invitations/redeem', (route: Route) => {
    available += 3; totalGranted += 3
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account()) })
  })
  await page.route('**/api/auth/logout', (route: Route) => {
    loggedIn = false
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/chat/stream', async (route: Route) => {
    chatCalls += 1
    const body = route.request().postDataJSON() as { question: string; request_id?: string }
    expect(body.request_id?.length).toBeGreaterThanOrEqual(32)
    available -= 1
    const response = {
      question: body.question, answer: '这是离线 Mock 回答。', content_type: 'grounded', answer_origin: 'model', citations: [],
      retrieval: { question: body.question, mode_requested: 'hybrid', mode_used: 'hybrid', semantic_error: null, results: [] },
      answer_completeness: { status: 'not_applicable', action_request: false, human_review: false, reason: '' },
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('done', { response, safety_buffered: true }) })
  })
  return { chatCalls: () => chatCalls }
}

test('邮箱登录保留问题、手动发送、兑换并退出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop account flow')
  const state = await mockStage9N(page)
  await page.goto('/agent')
  const input = page.getByLabel('输入问题')
  await input.fill('登录后再发送的问题')
  await page.getByRole('button', { name: '登录后发送' }).click()
  await expect(page.getByLabel('账号与问答额度')).toBeVisible()
  await expect(input).toHaveValue('登录后再发送的问题')
  expect(state.chatCalls()).toBe(0)

  await page.getByPlaceholder('name@example.com').fill('reader@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await page.getByPlaceholder('000000').fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(input).toHaveValue('登录后再发送的问题')
  expect(state.chatCalls()).toBe(0)

  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('这是离线 Mock 回答。')).toBeVisible()
  expect(state.chatCalls()).toBe(1)
  await expect(page.getByRole('button', { name: '剩余 2 次' })).toBeVisible()

  await page.getByRole('button', { name: '剩余 2 次' }).click()
  await page.getByPlaceholder('输入一次性邀请码').fill('POD-TEST-CODE-123456789')
  await page.getByRole('button', { name: '兑换 +3 次' }).click()
  await expect(page.getByText('邀请码已兑换，已增加 3 次问答机会。')).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByRole('button', { name: '邮箱登录' })).toBeVisible()
})

test('手机端认证弹层无横向溢出且未登录不可发起问答', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile account flow')
  const state = await mockStage9N(page)
  await page.goto('/agent')
  await page.getByRole('button', { name: '邮箱登录' }).tap()
  await expect(page.getByLabel('账号与问答额度')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(state.chatCalls()).toBe(0)
})
