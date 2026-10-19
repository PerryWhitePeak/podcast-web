import { expect, test } from '@playwright/test'

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

test('长回答完成后不重复正文，访谈依据保持在回答之后', async ({ page }, testInfo) => {
  test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name), 'desktop and mobile Chromium simulation')
  const direct = '先明确一个可以观察的目标，再选一件低风险的小事执行，并按结果调整。'
  const detail = Array.from({ length: 12 }, (_, index) => `${index + 1}. 记录这一步的实际结果，并检查是否仍适合自己的情况。`).join('\n')
  const answer = `${direct}\n\nAI建议：\n${detail}\n\n## 访谈依据\n\n这里展示与前文观点直接对应的访谈依据。`
  await page.route('**/api/chat/stream', (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: frame('status', { phase: 'generating', message: '正在生成回答并逐段核验……' })
      + frame('delta', { text: direct, validation: 'citation_quote_speaker_checks_passed' })
      + frame('delta', { text: answer.slice(direct.length), validation: 'citation_quote_speaker_checks_passed' })
      + frame('citations', { items: [] })
      + frame('done', { response: {
        question: '如何行动？', answer, content_type: 'mixed', answer_origin: 'model', citations: [],
        retrieval: { question: '如何行动？', mode_requested: 'hybrid', mode_used: 'hybrid', results: [] },
        answer_completeness: { action_request: true, status: 'pending_human_review' },
      } }),
  }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('如何行动？')
  await page.getByRole('button', { name: '发送' }).click()
  const response = page.locator('.message-assistant .assistant-response')
  await expect(response.locator('.direct-answer')).toContainText(direct)
  await expect(response.locator('.interview-analysis')).toContainText('访谈依据')
  await expect(response.locator('.answer-text ol li')).toHaveCount(12)
  expect((await response.textContent())?.split(direct).length).toBe(2)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflow).toBe(false)
})

test('流式校验失败撤回草稿，只有用户点击后才重新生成', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop failure flow')
  let calls = 0
  await page.route('**/api/chat/stream', (route) => {
    calls += 1
    return route.fulfill(calls === 1 ? {
      status: 200, contentType: 'text/event-stream',
      body: frame('delta', { text: '这段待撤回的草稿。', validation: 'citation_quote_speaker_checks_passed' })
        + frame('error', { code: 'CITATION_VALIDATION_FAILED', message: '本次回答未能通过内容校验，请重新生成。' }),
    } : {
      status: 200, contentType: 'text/event-stream',
      body: frame('delta', { text: '这是用户主动重新生成后的完整回答。', validation: 'citation_quote_speaker_checks_passed' })
        + frame('citations', { items: [] })
        + frame('done', { response: {
          question: '测试引用失败', answer: '这是用户主动重新生成后的完整回答。', content_type: 'grounded', answer_origin: 'model', citations: [],
          retrieval: { question: '测试引用失败', mode_requested: 'hybrid', mode_used: 'hybrid', results: [] },
          answer_completeness: { action_request: false, status: 'not_applicable' },
        } }),
    })
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('测试引用失败')
  await page.getByRole('button', { name: '发送' }).click()
  const result = page.locator('.message-assistant')
  await expect(result).toContainText('本次回答未完成')
  await expect(result).not.toContainText('这段待撤回的草稿。')
  await expect(result).toContainText('回答与访谈原文无法可靠对应')
  await expect(result).not.toContainText('内容校验')
  await expect(result.locator('.citations-group')).toHaveCount(0)
  await expect(result).not.toContainText('ev_')
  expect(calls).toBe(1)
  await result.getByRole('button', { name: '重新生成' }).click()
  await expect(result).toContainText('这是用户主动重新生成后的完整回答。')
  expect(calls).toBe(2)
})
