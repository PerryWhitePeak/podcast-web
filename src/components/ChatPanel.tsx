import { FormEvent, useEffect, useRef, useState } from 'react'
import { askQuestionStream } from '../lib/api'
import { publicAnswerText, publicFailure, type PublicFailure } from '../lib/format'
import type { AccountResponse, ChatResponse, Citation } from '../types'
import { CitationCard } from './CitationCard'
import { AnswerText } from './AnswerText'
import { RetryIcon, SendIcon } from './Icons'

let fallbackId = 0

export function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Message keys are not security tokens. This monotonic fallback keeps chat usable
  // in older webviews and non-secure LAN contexts without Web Crypto.
  fallbackId += 1
  return `local-${Date.now().toString(36)}-${fallbackId.toString(36)}`
}

type StreamPhase = 'retrieving' | 'generating' | 'validating'

export function publicPhaseLabel(phase: StreamPhase): string {
  if (phase === 'generating') return '正在整理回答，内容较多时可能需要一点时间……'
  if (phase === 'validating') return '回答即将完成……'
  return '正在查找相关访谈内容……'
}

export function isPublicFixedPrompt(value: string): boolean {
  const question = value.trim()
  return /^(?:你?好|您好|哈[喽啰]|嗨|hi|hello|hey|早上好|上午好|下午好|晚上好)[!！。,.，\s]*$/i.test(question)
    || /^(?:请问)?(?:你|这个(?:网站|助手))(?:到底)?(?:是|用的|使用的|基于)(?:什么|哪个|哪种)?(?:ai\s*)?(?:模型|助手|机器人)(?:版本)?[?？。\s]*$/i.test(question)
    || /^(?:你|这个(?:网站|助手))(?:能|可以|会)(?:做|干|回答|帮我)(?:什么|哪些)(?:事|问题|功能)?[?？。\s]*$/i.test(question)
    || /^(?:(?:这个网站|网站|这里)(?:有|提供|支持)(?:什么|哪些)(?:功能|内容)|(?:怎样|怎么|如何)(?:查看|打开|阅读|搜索)(?:访谈)?(?:原文|逐字稿)|(?:怎样|怎么|如何)(?:播放|收听|定位)(?:引用|访谈|原文)?(?:音频|原声))[?？。\s]*$/i.test(question)
    || /^(?:请)?(?:忽略|绕过|关闭|取消).{0,16}(?:引用|证据|校验|验证|系统规则|安全规则).{0,12}(?:直接)?回答[!！。?？\s]*$/i.test(question)
}

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; status: 'loading'; question: string; text: string; phase: string }
  | { id: string; role: 'assistant'; status: 'streaming'; question: string; text: string; phase: string }
  | { id: string; role: 'assistant'; status: 'success'; question: string; data: ChatResponse; safetyDegraded?: boolean }
  | { id: string; role: 'assistant'; status: 'degraded'; question: string; data: ChatResponse; safetyDegraded?: boolean }
  | { id: string; role: 'assistant'; status: 'error'; question: string; failure: PublicFailure }

interface ChatPanelProps {
  onPlayCitation: (citation: Citation) => void
  llmAvailable: boolean
  serviceAvailable: boolean
  account: AccountResponse | null
  authRequired: boolean
  onRequireLogin: () => void
  onAccountRefresh: () => void
}

const prompts = ['出个薄肌教程', '薄肌理论的核心是什么？', '普通大学生怎么实践孙学？']
const interviewHeading = /^#{1,3}\s*(?:访谈依据|访谈中是怎么讨论的？)\s*$/m

function AnswerSections({ text }: { text: string }) {
  const clean = publicAnswerText(text)
  const match = interviewHeading.exec(clean)
  if (!match) return <div className="direct-answer"><AnswerText text={clean} /></div>
  const direct = clean.slice(0, match.index).trim()
  const interview = clean.slice(match.index + match[0].length).trim()
  return <>
    <div className="direct-answer"><AnswerText text={direct} /></div>
    <section className="interview-analysis" aria-label="访谈中的相关讨论">
      <h2>访谈依据</h2>
      <AnswerText text={interview} />
    </section>
  </>
}

function EvidencePanel({ citations, onPlayCitation, answerMode }: { citations: Citation[]; onPlayCitation: (citation: Citation) => void; answerMode?: ChatResponse['answer_mode'] }) {
  if (!citations.length && answerMode === 'basic_conversation') return null
  if (!citations.length) return <div className="no-citations">当前回答没有可核验的访谈原文。</div>
  return <details className="citations-group">
    <summary>原文证据 · {citations.length} 条 <span>展开查看逐字稿与音频</span></summary>
    <div className="citation-list">
      {citations.slice(0, 4).map((citation, index) => <CitationCard key={citation.citation_id} citation={citation} index={index} onPlay={onPlayCitation} />)}
      {citations.length > 4 && <details className="more-citations"><summary>查看其余 {citations.length - 4} 条原文</summary>
        {citations.slice(4).map((citation, index) => <CitationCard key={citation.citation_id} citation={citation} index={index + 4} onPlay={onPlayCitation} />)}
      </details>}
    </div>
  </details>
}

export function ChatPanel({ onPlayCitation, llmAvailable, serviceAvailable, account, authRequired, onRequireLogin, onAccountRefresh }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followOutputRef = useRef(true)
  const activeControllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => activeControllerRef.current?.abort(), [])
  useEffect(() => {
    if (followOutputRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const runQuestion = async (question: string, replaceId?: string) => {
    const clean = question.trim()
    if (!clean || !serviceAvailable || activeControllerRef.current) return
    const publicFixed = isPublicFixedPrompt(clean)
    if (authRequired && !account?.csrf_token && !publicFixed) { onRequireLogin(); return }
    if (authRequired && account && account.available < 1 && !publicFixed) return
    const responseId = replaceId ?? createMessageId()
    const requestId = createMessageId().padEnd(32, '0')
    const controller = new AbortController()
    let waitTimer: ReturnType<typeof setTimeout> | undefined
    activeControllerRef.current = controller
    followOutputRef.current = true
    setBusy(true)
    setInput((current) => replaceId && current.trim() !== clean ? current : '')
    setMessages((current) => replaceId
      ? current.map((message) => message.id === replaceId ? { id: responseId, role: 'assistant', status: 'loading', question: clean, text: '', phase: publicPhaseLabel('retrieving') } : message)
      : [...current, { id: createMessageId(), role: 'user', text: clean }, { id: responseId, role: 'assistant', status: 'loading', question: clean, text: '', phase: publicPhaseLabel('retrieving') }])
    waitTimer = setTimeout(() => {
      setMessages((current) => current.map((message) => message.id === responseId && message.role === 'assistant' && (message.status === 'loading' || message.status === 'streaming')
        ? { ...message, phase: '仍在处理中，请保持页面打开；这不代表发送失败。' } : message))
    }, 15_000)
    try {
      await askQuestionStream(clean, 5, (event) => {
        if (event.event === 'status') {
          setMessages((current) => current.map((message) => message.id === responseId && message.role === 'assistant' && (message.status === 'loading' || message.status === 'streaming')
            ? { ...message, status: event.data.phase === 'retrieving' ? 'loading' : 'streaming', phase: publicPhaseLabel(event.data.phase) } : message))
        } else if (event.event === 'delta') {
          setMessages((current) => current.map((message) => message.id === responseId && message.role === 'assistant' && (message.status === 'loading' || message.status === 'streaming')
            ? { ...message, status: 'streaming', text: message.text + event.data.text } : message))
        } else if (event.event === 'done') {
          setMessages((current) => current.map((message) => message.id === responseId
            ? { id: responseId, role: 'assistant', status: ['model', 'fixed'].includes(event.data.response.answer_origin) ? 'success' : 'degraded', question: clean, data: event.data.response, safetyDegraded: event.data.degraded === true } : message))
        }
      }, controller.signal, account?.csrf_token ? { requestId, csrfToken: account.csrf_token } : undefined)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'AUTH_REQUIRED') onRequireLogin()
      setInput((current) => current || clean)
      setMessages((current) => current.map((message) => message.id === responseId && message.role === 'assistant' && (message.status === 'loading' || message.status === 'streaming')
        ? { id: responseId, role: 'assistant', status: 'error', question: clean, failure: publicFailure(error) } : message))
    } finally {
      clearTimeout(waitTimer)
      if (activeControllerRef.current === controller) activeControllerRef.current = null
      setBusy(false)
      if (authRequired) onAccountRefresh()
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void runQuestion(input)
  }

  return (
    <section className="chat-panel panel" aria-label="AI 问答">
      <div className="panel-heading">
        <div><span className="eyebrow">ASK THE ARCHIVE</span><h1>问访谈，也问怎么做</h1></div>
        <span className="independent-badge">观点有据 · 建议有边界</span>
      </div>
      <div className="chat-scroll" ref={scrollRef} onScroll={(event) => {
        const node = event.currentTarget
        followOutputRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
      }} aria-live="polite">
        {!serviceAvailable && <p className="quota-empty" role="status">在线问答服务尚未连接。页面与界面可以浏览，但不会发送问题、扣减额度或生成模拟回答。</p>}
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="seal">孙</div>
            <h2>直接问，认真答</h2>
            <p>聊聊孙学、薄肌理论，以及如何把访谈中的想法用在现实问题里。观点和建议会标清边界，原话可展开核对。</p>
            <div className="prompt-grid">
              {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}</button>)}
            </div>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            {message.role === 'user' ? <div className="user-bubble">{message.text}</div> : message.status === 'loading' || message.status === 'streaming' ? (
              <div className="assistant-response stream-response">
                <div className="answer-kicker">正在回答</div>
                {message.text && <AnswerSections text={message.text} />}
                <p className="stream-status" role="status">{message.phase}</p>
              </div>
            ) : message.status === 'error' ? (
              <div className="assistant-bubble error-answer"><strong>{message.failure.title}</strong>
                <p>{message.failure.stopped ? <><span className="stopped-label">已停止生成</span>，问题已保留。</> : message.failure.message}</p><p className="retry-note">{message.failure.retryNote}</p><button type="button" onClick={() => void runQuestion(message.question, message.id)} disabled={busy}><RetryIcon /> {message.failure.retryLabel}</button>
              </div>
            ) : (
              <div className="assistant-response">
                <div className="answer-kicker"><span>{message.data.answer_origin === 'fixed' ? '网站助手' : message.safetyDegraded && message.data.answer_origin === 'evidence_extract' ? '证据摘录 · 安全降级' : message.data.answer_origin === 'evidence_extract' ? '根据访谈原文整理' : message.data.answer_origin === 'safety_fallback' ? '当前材料不足' : 'AI 回答'}</span><span className={`content-type type-${message.data.content_type}`}>{message.data.answer_mode === 'basic_conversation' ? (message.data.model_used ? '普通对话' : '即时回复') : message.data.content_type === 'grounded' ? '来自访谈' : message.data.content_type === 'mixed' ? '事实与分析' : '信息有限'}</span></div>
                {message.data.answer_completeness?.action_request && <p className="completeness-note" role="status">{message.data.answer_completeness.status === 'pending_human_review' ? '这部分包含一般建议，请结合你的实际情况判断。' : '现有材料不足以给出完整步骤，请把建议作为参考。'}</p>}
                <AnswerSections text={message.data.answer} />
                <EvidencePanel citations={message.data.citations} onPlayCitation={onPlayCitation} answerMode={message.data.answer_mode} />
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value.slice(0, 500))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={!serviceAvailable ? '在线服务尚未连接，暂时不能发送问题' : authRequired && !account ? '可先问网站用法；调用模型前会要求登录' : authRequired && account && account.available < 1 ? '额度已用完；网站用法等即时回复仍可使用' : llmAvailable ? '问访谈事实，也可以请我分析观点…' : '网站用法仍可询问；模型问答暂不可用'}
          rows={1}
          maxLength={500}
          disabled={busy}
          aria-label="输入问题"
        />
        <div className="composer-footer"><span>{input.length}/500 · Enter 发送，Shift + Enter 换行</span>
          {busy ? <button className="stop-generation" type="button" onClick={(event) => {
            // This node is replaced by the submit button as soon as abort settles.
            // Prevent the same click's default action from submitting the form after
            // React has swapped the node state.
            event.preventDefault()
            activeControllerRef.current?.abort()
          }}>停止生成</button>
            : <button type="submit" onClick={() => {
              if (authRequired && !account && !isPublicFixedPrompt(input)) onRequireLogin()
            }} disabled={!serviceAvailable || !input.trim() || (authRequired && !!account && account.available < 1 && !isPublicFixedPrompt(input))}><SendIcon /> {!serviceAvailable ? '服务未连接' : authRequired && !account && !isPublicFixedPrompt(input) ? '登录后发送' : '发送'}</button>}
        </div>
      </form>
      {authRequired && account && account.available < 1 && <p className="quota-empty" role="status">你的免费问答次数已用完，可以通过邀请码获得额外 3 次机会。</p>}
    </section>
  )
}
