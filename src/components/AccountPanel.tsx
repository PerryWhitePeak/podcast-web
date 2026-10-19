import { FormEvent, useState } from 'react'
import { ApiError, logout, redeemInvitation, requestOtp, verifyOtp } from '../lib/api'
import type { AccountResponse } from '../types'

interface AccountPanelProps {
  account: AccountResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccount: (account: AccountResponse | null) => void
  serviceAvailable: boolean
}

function authError(error: unknown): string {
  if (!(error instanceof ApiError)) return '操作没有完成，请稍后再试。'
  if (error.code === 'OTP_INVALID') return '验证码错误、已过期或已经使用。'
  if (error.code === 'RATE_LIMITED') return '操作过于频繁，请稍后再试。'
  if (error.code === 'INVITATION_REJECTED') return '邀请码无效、已使用或已停用。'
  if (error.code === 'MAIL_UNAVAILABLE') return '验证码暂时无法发送，请稍后再试。'
  return '操作没有完成，请稍后再试。'
}

export function AccountPanel({ account, open, onOpenChange, onAccount, serviceAvailable }: AccountPanelProps) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invitation, setInvitation] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const sendCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!serviceAvailable) return
    setBusy(true); setMessage(null)
    try {
      const result = await requestOtp(email.trim())
      setSent(true); setMessage(result.message)
    } catch (error) { setMessage(authError(error)) }
    finally { setBusy(false) }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (!serviceAvailable) return
    setBusy(true); setMessage(null)
    try {
      const result = await verifyOtp(email.trim(), code.trim())
      onAccount(result); onOpenChange(false); setCode(''); setSent(false)
    } catch (error) { setMessage(authError(error)) }
    finally { setBusy(false) }
  }

  const redeem = async (event: FormEvent) => {
    event.preventDefault()
    if (!serviceAvailable || !account?.csrf_token) return
    setBusy(true); setMessage(null)
    try {
      const result = await redeemInvitation(invitation.trim(), account.csrf_token)
      onAccount({ ...result, csrf_token: account.csrf_token })
      setInvitation(''); setMessage('邀请码已兑换，已增加 3 次问答机会。')
    } catch (error) { setMessage(authError(error)) }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    if (!serviceAvailable || !account?.csrf_token) return
    setBusy(true); setMessage(null)
    try { await logout(account.csrf_token); onAccount(null); onOpenChange(false) }
    catch (error) { setMessage(authError(error)) }
    finally { setBusy(false) }
  }

  return <div className="account-control">
    <button className="account-trigger" type="button" onClick={() => onOpenChange(!open)} aria-expanded={open}>
      {account ? `剩余 ${account.available} 次` : '邮箱登录'}
    </button>
    {open && <section className="account-popover" aria-label="账号与问答额度">
      {!serviceAvailable && <p className="account-message" role="status">在线服务尚未连接，暂时不能登录、查询额度或兑换邀请码。</p>}
      {account ? <>
        <div className="account-summary"><span>当前账号</span><strong>{account.email}</strong></div>
        <dl className="quota-grid">
          <div><dt>剩余</dt><dd>{account.available}</dd></div>
          <div><dt>累计获得</dt><dd>{account.total_granted}</dd></div>
          <div><dt>已使用</dt><dd>{account.consumed}</dd></div>
        </dl>
        <form onSubmit={redeem} className="account-form compact">
          <label>兑换邀请码<input value={invitation} onChange={(event) => setInvitation(event.target.value.slice(0, 96))} autoComplete="off" placeholder="输入一次性邀请码" /></label>
          <button type="submit" disabled={!serviceAvailable || busy || !invitation.trim()}>兑换 +3 次</button>
        </form>
        <button className="account-logout" type="button" onClick={() => void signOut()} disabled={!serviceAvailable || busy}>退出登录</button>
      </> : <>
        <div className="account-summary"><span>邮箱验证码登录</span><strong>首次登录赠送 3 次免费问答</strong></div>
        {!sent ? <form onSubmit={sendCode} className="account-form">
          <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} autoComplete="email" placeholder="name@example.com" required /></label>
          <button type="submit" disabled={!serviceAvailable || busy || !email.trim()}>发送验证码</button>
        </form> : <form onSubmit={verify} className="account-form">
          <label>六位验证码<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" placeholder="000000" required /></label>
          <button type="submit" disabled={!serviceAvailable || busy || code.length !== 6}>登录</button>
          <button className="account-link" type="button" onClick={() => { setSent(false); setCode(''); setMessage(null) }}>更换邮箱或重发</button>
        </form>}
      </>}
      {message && <p className="account-message" role="status">{message}</p>}
      <p className="account-privacy">验证码 10 分钟有效。登录后不会自动发送尚未提交的问题。</p>
    </section>}
  </div>
}
