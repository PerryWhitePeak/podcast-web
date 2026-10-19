import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioPlayer, type AudioPlayerHandle } from '../components/AudioPlayer'
import { AccountPanel } from '../components/AccountPanel'
import { ChatPanel } from '../components/ChatPanel'
import { HealthPanel } from '../components/HealthPanel'
import { SearchPanel } from '../components/SearchPanel'
import { SiteHeader } from '../components/SiteHeader'
import { ApiError, getAccount, getHealth, isApiConfigured } from '../lib/api'
import { errorLabel } from '../lib/format'
import type { AccountResponse, Citation, HealthResponse } from '../types'

export function AgentPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(isApiConfigured)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthOpen, setHealthOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'chat' | 'search'>('chat')
  const [account, setAccount] = useState<AccountResponse | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [playback, setPlayback] = useState<{ citation: Citation; sequence: number } | null>(null)
  const playerRef = useRef<AudioPlayerHandle>(null)
  const refreshHealth = useCallback(async () => { setHealthLoading(true); setHealthError(null); try { setHealth(await getHealth()) } catch (error) { setHealth(null); setHealthError(errorLabel(error)) } finally { setHealthLoading(false) } }, [])
  useEffect(() => {
    if (isApiConfigured) void refreshHealth()
    else setHealthError('在线服务尚未连接。')
  }, [refreshHealth])
  const refreshAccount = useCallback(async () => {
    try { setAccount(await getAccount()) }
    catch (error) { if (error instanceof ApiError && [401, 503].includes(error.status ?? 0)) setAccount(null) }
  }, [])
  useEffect(() => {
    if (health?.auth_enabled === true) void refreshAccount()
    else setAccount(null)
  }, [health?.auth_enabled, refreshAccount])
  const serviceAvailable = isApiConfigured && !healthLoading && !healthError && health != null
  const serviceLabel = !isApiConfigured
    ? '服务暂不可用'
    : healthLoading
      ? '检查服务'
    : healthError
      ? '服务暂不可用'
      : health?.llm_provider === 'mock'
        ? 'Mock（明确测试模式）'
        : health?.status === 'ok'
          ? '服务可用'
          : health
            ? '部分功能受限'
            : '服务状态未知'
  const authRequired = health ? health.auth_enabled === true : !healthLoading
  const healthControl = <div className="header-controls">{authRequired && <AccountPanel account={account} open={accountOpen} onOpenChange={setAccountOpen} onAccount={setAccount} serviceAvailable={serviceAvailable} />}<div className="health-control"><button className="health-trigger" type="button" onClick={() => setHealthOpen((value) => !value)} aria-expanded={healthOpen}><span className={`status-dot ${health?.status === 'ok' ? 'ok' : healthError ? 'offline' : 'warning'}`} />{serviceLabel}</button>{healthOpen && <HealthPanel health={health} loading={healthLoading} error={healthError} onRetry={isApiConfigured ? () => void refreshHealth() : undefined} />}</div></div>
  const playCitation = (citation: Citation) => setPlayback((current) => ({ citation, sequence: (current?.sequence ?? 0) + 1 }))
  useEffect(() => {
    if (playback) playerRef.current?.playCitation(playback.citation)
  }, [playback])
  return <div className="agent-shell"><SiteHeader current="agent" aside={healthControl} /><nav className="mobile-tabs" aria-label="页面区域"><button className={mobileTab === 'chat' ? 'active' : ''} onClick={() => setMobileTab('chat')}>AI 问答</button><button className={mobileTab === 'search' ? 'active' : ''} onClick={() => setMobileTab('search')}>逐字稿搜索</button></nav><main className="workspace"><div className={`workspace-pane chat-pane ${mobileTab !== 'chat' ? 'mobile-hidden' : ''}`}><ChatPanel onPlayCitation={playCitation} llmAvailable={serviceAvailable && health?.llm_configured === true} serviceAvailable={serviceAvailable} account={account} authRequired={authRequired} onRequireLogin={() => setAccountOpen(true)} onAccountRefresh={() => void refreshAccount()} /></div><div className={`workspace-pane search-pane ${mobileTab !== 'search' ? 'mobile-hidden' : ''}`}><SearchPanel onPlayCitation={playCitation} serviceAvailable={serviceAvailable} /></div></main>{playback && <div className="agent-audio-popover"><AudioPlayer ref={playerRef} health={health} onClose={() => setPlayback(null)} /></div>}</div>
}
